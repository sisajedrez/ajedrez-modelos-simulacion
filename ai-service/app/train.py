
import logging
import random
import threading
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import chess
from psycopg2.extras import Json

from .config import parse_hidden, settings
from .db import get_conn
from .nn import encode_samples, load_checkpoint, save_net, train_net
from .policies import DIFICIL, LEVELS, REP_ELO, level_from_name
from .predictor import model_path

log = logging.getLogger("ai.train")

TRAINING_SQL = """
SELECT m.fen_before, m.san, m.color::text, g.result, g.white_type::text, g.black_type::text, p.name
FROM moves m
JOIN games g ON g.id = m.game_id
LEFT JOIN difficulty_profiles p ON p.id = g.difficulty_profile_id
WHERE g.status = 'FINALIZADA'
"""


def winner_color(result: Optional[str]) -> Optional[str]:
    r = (result or "").strip().upper()
    if r in ("1-0", "WHITE", "BLANCAS"):
        return "WHITE"
    if r in ("0-1", "BLACK", "NEGRAS"):
        return "BLACK"
    return None


def san_to_uci(fen_before: str, san: str) -> Optional[str]:
    try:
        return chess.Board(fen_before).parse_san(san).uci()
    except ValueError:
        return None


def collect_samples(conn, cap: int, rng: random.Random) -> Dict[str, List[Tuple[str, str]]]:
    """Recorre la tabla en streaming y devuelve hasta `cap` muestras (fen, uci) por nivel
    usando reservoir sampling (muestra uniforme sin cargar todo en memoria)."""
    samples: Dict[str, List[Tuple[str, str]]] = {lvl: [] for lvl in LEVELS}
    seen = {lvl: 0 for lvl in LEVELS}
    with conn.cursor(name="train_stream") as cur:
        cur.itersize = 5000
        cur.execute(TRAINING_SQL)
        for fen_before, san, color, result, white_type, black_type, profile in cur:
            mover_type = white_type if color == "WHITE" else black_type
            if mover_type != "HUMAN":
                continue
            level = level_from_name(profile)
            if level is None:
                continue
            if level == DIFICIL and winner_color(result) != color:
                continue
            uci = san_to_uci(fen_before, san)
            if uci is None:
                continue
            seen[level] += 1
            bucket = samples[level]
            if len(bucket) < cap:
                bucket.append((fen_before, uci))
            else:
                j = rng.randint(0, seen[level] - 1)
                if j < cap:
                    bucket[j] = (fen_before, uci)
    return samples


def fit(samples: Dict[str, List[Tuple[str, str]]], models_dir: Path) -> Tuple[object, dict]:
    """Entrena la red con las muestras de los tres niveles (continuando desde la actual si existe)."""
    fens, moves, elos = [], [], []
    for level in LEVELS:
        for fen, uci in samples[level]:
            fens.append(fen)
            moves.append(uci)
            elos.append(REP_ELO[level])
    X, E, Y, invalid = encode_samples(fens, moves, elos)

    path = model_path(models_dir)
    init_state, config, epochs, lr = None, {
        "hidden": parse_hidden(settings.nn_hidden)
    }, settings.nn_epochs, settings.nn_lr
    if path.exists():
        try:
            ckpt = load_checkpoint(path)
            init_state, config = ckpt["state_dict"], ckpt["config"]
            epochs, lr = settings.nn_finetune_epochs, settings.nn_finetune_lr
            log.info("Fine-tuning desde la red existente (%s)", path)
        except Exception as exc:  # archivo corrupto o de otra versión: se entrena desde cero
            log.warning("No se pudo reutilizar %s (%s): se entrena desde cero", path, exc)

    net, metrics = train_net(
        X, E, Y,
        config=config, init_state=init_state, epochs=epochs, lr=lr,
        batch_size=settings.nn_batch_size, logger=log.info,
    )
    metrics["invalid_rows"] = int(invalid)
    metrics["mode"] = "fine-tune" if init_state is not None else "from-scratch"
    metrics["per_level"] = {level: len(samples[level]) for level in LEVELS}
    save_net(net, path, metrics)
    return net, metrics


def train_all(models_dir: Path = None, database_url: str = None, rng: random.Random = None) -> dict:
    models_dir = Path(models_dir or settings.models_dir)
    rng = rng or random.Random(42)
    with get_conn(database_url) as conn:
        samples = collect_samples(conn, settings.db_train_max_rows_per_level, rng)
        conn.rollback()  # cierra la transacción del cursor nombrado

        total = sum(len(v) for v in samples.values())
        if total < settings.train_min_rows:
            return {"status": "skipped", "reason": f"pocas muestras ({total} < {settings.train_min_rows})"}

        _, metrics = fit(samples, models_dir)
        path = model_path(models_dir)
        _register(conn, metrics, path)
    return {"status": "trained", **metrics, "file": str(path)}


def _register(conn, metrics: dict, path: Path) -> None:
    """Deja constancia en la tabla ai_model_versions del esquema."""
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO ai_model_versions (dataset_size, metrics, file_path) VALUES (%s, %s, %s)",
                (metrics["samples"], Json({"model": "policy_net", **metrics}), str(path)),
            )
        conn.commit()
    except Exception as exc:  # el entrenamiento no debe fallar por no poder registrar la versión
        conn.rollback()
        log.warning("No se pudo registrar el modelo en ai_model_versions: %s", exc)


class TrainManager:
    """Ejecuta un entrenamiento a la vez en segundo plano y guarda su estado."""

    def __init__(self):
        self._lock = threading.Lock()
        self.state = {"status": "idle"}

    @property
    def running(self) -> bool:
        return self.state.get("status") == "running"

    def begin(self) -> bool:
        with self._lock:
            if self.running:
                return False
            self.state = {"status": "running", "started_at": time.time()}
            return True

    def run(self, predictor) -> None:
        started = self.state.get("started_at", time.time())
        try:
            report = train_all(predictor.models_dir)
            predictor.load()  # recarga en caliente la red nueva
            self.state = {"status": "done", "started_at": started, "finished_at": time.time(), "report": report}
        except Exception as exc:
            log.exception("Fallo el entrenamiento")
            self.state = {"status": "error", "started_at": started, "finished_at": time.time(), "error": str(exc)}
