import dataclasses
import random
from contextlib import contextmanager

import chess

from app import train as train_module
from app.config import settings
from app.nn import MODEL_FILENAME, load_checkpoint
from app.predictor import Predictor


class FakeCursor:
    """Imita el cursor de psycopg2 que usa train.py (con nombre = streaming; sin nombre = INSERT)."""

    def __init__(self, rows, log):
        self.rows, self.log, self.itersize = rows, log, 0

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self.log.append((sql.strip().split()[0], params))

    def __iter__(self):
        return iter(self.rows)


class FakeConn:
    def __init__(self, rows):
        self.rows, self.log = rows, []

    def cursor(self, name=None):
        return FakeCursor(self.rows, self.log)

    def rollback(self):
        pass

    def commit(self):
        pass


def make_rows(n_games=8, plies=40, seed=0):
    """Filas como las devuelve TRAINING_SQL: (fen_before, san, color, result, white_type, black_type, perfil)."""
    rng = random.Random(seed)
    profiles = ["Fácil", "Medio", "Difícil"]
    rows = []
    for g in range(n_games):
        board = chess.Board()
        result = rng.choice(["1-0", "0-1", "Tablas"])
        while not board.is_game_over() and board.ply() < plies:
            move = rng.choice(list(board.legal_moves))
            color = "WHITE" if board.turn == chess.WHITE else "BLACK"
            rows.append((board.fen(), board.san(move), color, result, "HUMAN", "HUMAN", profiles[g % 3]))
            board.push(move)
    return rows


def test_collect_samples_applies_the_rules():
    start = chess.STARTING_FEN
    rows = [
        (start, "e4", "WHITE", "1-0", "HUMAN", "HUMAN", "Fácil"),         # entra
        (start, "d4", "WHITE", "1-0", "STOCKFISH", "HUMAN", "Fácil"),     # mueve la IA: se descarta
        (start, "Qh9", "WHITE", "1-0", "HUMAN", "HUMAN", "Fácil"),        # SAN inválido: se descarta
        (start, "e4", "WHITE", "0-1", "HUMAN", "HUMAN", "Difícil"),       # perdedor en Difícil: se descarta
        (start, "e4", "WHITE", "1-0", "HUMAN", "HUMAN", "Difícil"),       # ganador en Difícil: entra
        (start, "Nf3", "WHITE", "Tablas", "HUMAN", "HUMAN", "Medio"),     # entra
        (start, "c4", "WHITE", "Tablas", "HUMAN", "HUMAN", "Perfil raro"),  # perfil desconocido: se descarta
    ]
    out = train_module.collect_samples(FakeConn(rows), cap=100, rng=random.Random(0))
    assert out["FACIL"] == [(start, "e2e4")]
    assert out["MEDIO"] == [(start, "g1f3")]
    assert out["DIFICIL"] == [(start, "e2e4")]


def test_collect_samples_respects_cap():
    rows = make_rows()
    out = train_module.collect_samples(FakeConn(rows), cap=20, rng=random.Random(0))
    assert all(len(v) <= 20 for v in out.values()) and any(len(v) == 20 for v in out.values())


def test_train_all_trains_then_fine_tunes_and_predictor_reloads(tmp_path, monkeypatch):
    cfg = dataclasses.replace(
        settings, nn_hidden="32", nn_epochs=3, nn_finetune_epochs=1, nn_batch_size=64, train_min_rows=20,
        db_train_max_rows_per_level=500,
    )
    monkeypatch.setattr(train_module, "settings", cfg)
    conn = FakeConn(make_rows())

    @contextmanager
    def fake_get_conn(url=None):
        yield conn

    monkeypatch.setattr(train_module, "get_conn", fake_get_conn)

    first = train_module.train_all(tmp_path)
    assert first["status"] == "trained" and first["mode"] == "from-scratch"
    assert (tmp_path / MODEL_FILENAME).exists()
    assert sum(first["per_level"].values()) > 100
    assert any(op == "INSERT" for op, _ in conn.log)  # quedó registrada la versión (ai_model_versions)

    second = train_module.train_all(tmp_path)
    assert second["mode"] == "fine-tune"
    assert load_checkpoint(tmp_path / MODEL_FILENAME)["config"] == {"hidden": [32]}

    # el TrainManager recarga la red en caliente
    predictor = Predictor(tmp_path)
    manager = train_module.TrainManager()
    assert manager.begin() and not manager.begin()  # solo un entrenamiento a la vez
    manager.run(predictor)
    assert manager.state["status"] == "done" and predictor.status() == {"policy_net": True}


def test_train_all_skips_when_there_is_little_data(tmp_path, monkeypatch):
    monkeypatch.setattr(train_module, "settings", dataclasses.replace(settings, train_min_rows=10_000))

    @contextmanager
    def fake_get_conn(url=None):
        yield FakeConn(make_rows(n_games=2))

    monkeypatch.setattr(train_module, "get_conn", fake_get_conn)
    result = train_module.train_all(tmp_path)
    assert result["status"] == "skipped" and not (tmp_path / MODEL_FILENAME).exists()
