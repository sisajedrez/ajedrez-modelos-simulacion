
from __future__ import annotations

import json
import logging
import math
import os
import time
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence, Tuple

import chess
import numpy as np

from .features import N_FEATURES, board_a_features

log = logging.getLogger("ai.nn")

N_MOVES = 64 * 64
N_ELO = 16
N_INPUT = N_FEATURES + N_ELO
MODEL_FILENAME = "policy_net.npz"
DEFAULT_CONFIG = {"hidden": [512, 512]}

_ELO_CENTERS = np.linspace(600.0, 2800.0, N_ELO, dtype=np.float32)
_ELO_SIGMA = np.float32(110.0)


# codificación
def move_index(move: chess.Move) -> int:
    return move.from_square * 64 + move.to_square


def uci_to_index(uci: str) -> int:
    """UCI -> índice 0..4095. Lanza ValueError si no es una jugada válida (p. ej. '0000')."""
    move = chess.Move.from_uci(uci)
    if not move:
        raise ValueError(f"Jugada nula: {uci}")
    return move_index(move)


def legal_move_map(board: chess.Board) -> Dict[int, str]:
    """{índice: uci} de las jugadas legales. Las subpromociones se omiten (se juega dama)."""
    legal: Dict[int, str] = {}
    for move in board.legal_moves:
        if move.promotion and move.promotion != chess.QUEEN:
            continue
        legal[move_index(move)] = move.uci()
    return legal


def elo_features(elo) -> np.ndarray:
    """ELO (escalar o vector) -> [n, 16] campanas gaussianas entre 600 y 2800 (fuera de rango se satura)."""
    e = np.clip(np.asarray(elo, dtype=np.float32).reshape(-1, 1), 600.0, 2800.0)
    return np.exp(-0.5 * ((e - _ELO_CENTERS) / _ELO_SIGMA) ** 2).astype(np.float32)


def make_input(X: np.ndarray, E) -> np.ndarray:
    """Une features de tablero (uint8/float, [n,773]) y ELO ([n]) en la entrada float32 [n,789]."""
    out = np.empty((len(X), N_INPUT), dtype=np.float32)
    out[:, :N_FEATURES] = X
    out[:, N_FEATURES:] = elo_features(E)
    return out


def encode_samples(
    fens: Sequence[str],
    moves: Sequence[str],
    elos: Sequence[float],
    progress: Optional[Callable[[int], None]] = None,
    progress_every: int = 50_000,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, int]:
    """Convierte (fen, uci, elo) en arrays de entrenamiento. Descarta filas inválidas.

    Devuelve (X uint8 [n,773], elo float32 [n], y int64 [n], cantidad_descartada).
    """
    n = len(fens)
    X = np.zeros((n, N_FEATURES), dtype=np.uint8)
    E = np.zeros(n, dtype=np.float32)
    Y = np.zeros(n, dtype=np.int64)
    ok = 0
    invalid = 0
    for i, (fen, uci, elo) in enumerate(zip(fens, moves, elos), start=1):
        try:
            label = uci_to_index(str(uci).strip())
            X[ok] = board_a_features(chess.Board(str(fen))) > 0
        except (ValueError, TypeError):
            invalid += 1
            continue
        E[ok] = float(elo)
        Y[ok] = label
        ok += 1
        if progress and i % progress_every == 0:
            progress(i)
    return X[:ok], E[:ok], Y[:ok], invalid


#  modelo
class PolicyNet:
    """MLP: [789] -> ReLU(h1) -> ... -> [4096] logits. Pesos en float32."""

    def __init__(self, hidden: Sequence[int] = (512, 512), seed: int = 0):
        self.config = {"hidden": [int(h) for h in hidden]}
        rng = np.random.default_rng(seed)
        sizes = [N_INPUT, *self.config["hidden"], N_MOVES]
        last = len(sizes) - 2
        self.W: List[np.ndarray] = []
        self.b: List[np.ndarray] = []
        for i, (fan_in, fan_out) in enumerate(zip(sizes[:-1], sizes[1:])):
            gain = 1.0 if i == last else 2.0  # He en capas ocultas; salida chica => arranca casi uniforme
            w = rng.standard_normal((fan_in, fan_out), dtype=np.float32) * np.float32(math.sqrt(gain / fan_in))
            self.W.append(w)
            self.b.append(np.zeros(fan_out, dtype=np.float32))

    # estado (para guardar / continuar entrenamiento) ----
    def get_state(self) -> dict:
        return {"W": [w.copy() for w in self.W], "b": [b.copy() for b in self.b]}

    def set_state(self, state: dict) -> None:
        if [w.shape for w in state["W"]] != [w.shape for w in self.W]:
            raise ValueError("El estado guardado no coincide con la arquitectura de la red")
        self.W = [np.array(w, dtype=np.float32) for w in state["W"]]
        self.b = [np.array(b, dtype=np.float32) for b in state["b"]]

    def n_params(self) -> int:
        return int(sum(w.size for w in self.W) + sum(b.size for b in self.b))

    # propagación 
    def forward(self, x: np.ndarray, keep: bool = False):
        a = np.asarray(x, dtype=self.W[0].dtype)
        acts = [a]
        last = len(self.W) - 1
        logits = None
        for i, (w, b) in enumerate(zip(self.W, self.b)):
            z = a @ w
            z += b
            if i < last:
                a = np.maximum(z, 0, out=z)
                acts.append(a)
            else:
                logits = z
        return (logits, acts) if keep else logits

    def loss_and_grads(self, x: np.ndarray, y: np.ndarray):
        """Entropía cruzada media y gradientos de todos los parámetros."""
        logits, acts = self.forward(x, keep=True)
        n = len(y)
        rows = np.arange(n)
        shifted = logits - logits.max(axis=1, keepdims=True)
        expd = np.exp(shifted)
        total = expd.sum(axis=1, keepdims=True)
        loss = float(np.mean(np.log(total[:, 0]) - shifted[rows, y]))

        dz = expd / total
        dz[rows, y] -= 1.0
        dz /= n
        gW: List[Optional[np.ndarray]] = [None] * len(self.W)
        gb: List[Optional[np.ndarray]] = [None] * len(self.W)
        for i in reversed(range(len(self.W))):
            gW[i] = acts[i].T @ dz
            gb[i] = dz.sum(axis=0)
            if i > 0:
                dz = (dz @ self.W[i].T) * (acts[i] > 0)
        return loss, gW, gb


def softmax(logits: np.ndarray) -> np.ndarray:
    z = logits - logits.max(axis=-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=-1, keepdims=True)


# inferencia
def predict_probs(net: PolicyNet, board: chess.Board, elo: float) -> np.ndarray:
    """Softmax sobre las 4096 salidas (antes de filtrar por legalidad)."""
    x = make_input(board_a_features(board).reshape(1, -1), [elo])
    return softmax(net.forward(x))[0]


# entrenamiento
def evaluate(net: PolicyNet, X, E, Y, idx, batch_size: int = 2048) -> Dict[str, float]:
    loss_sum, top1, top3 = 0.0, 0, 0
    for start in range(0, len(idx), batch_size):
        b = idx[start:start + batch_size]
        logits = net.forward(make_input(X[b], E[b]))
        y = Y[b]
        rows = np.arange(len(b))
        shifted = logits - logits.max(axis=1, keepdims=True)
        loss_sum += float((np.log(np.exp(shifted).sum(axis=1)) - shifted[rows, y]).sum())
        top = np.argpartition(-logits, 2, axis=1)[:, :3]
        top3 += int((top == y[:, None]).any(axis=1).sum())
        top1 += int((logits.argmax(axis=1) == y).sum())
    n = max(1, len(idx))
    return {"val_loss": loss_sum / n, "top1": top1 / n, "top3": top3 / n}


def _lr_at(step: int, total: int, peak: float, warmup_frac: float = 0.1, floor_frac: float = 0.05) -> float:
    warm = max(1, int(total * warmup_frac))
    if step < warm:
        return peak * (step + 1) / warm
    progress = (step - warm) / max(1, total - warm)
    return peak * (floor_frac + (1 - floor_frac) * 0.5 * (1 + math.cos(math.pi * progress)))


def train_net(
    X: np.ndarray,
    E: np.ndarray,
    Y: np.ndarray,
    *,
    config: Optional[dict] = None,
    init_state: Optional[dict] = None,
    epochs: int = 8,
    batch_size: int = 512,
    lr: float = 1e-3,
    weight_decay: float = 1e-4,
    val_fraction: float = 0.1,
    patience: int = 2,
    seed: int = 42,
    logger: Callable[[str], None] = log.info,
) -> Tuple[PolicyNet, dict]:
    """Entrena (o continúa entrenando si hay `init_state`) y devuelve la mejor red según la validación."""
    if len(Y) < 10:
        raise ValueError("Muy pocas muestras para entrenar")
    started = time.perf_counter()
    rng = np.random.default_rng(seed)

    perm = rng.permutation(len(Y))
    n_val = min(max(1, int(len(Y) * val_fraction)), len(Y) - 1)
    val_idx, train_idx = perm[:n_val], perm[n_val:]

    net = PolicyNet(**{**DEFAULT_CONFIG, **(config or {})}, seed=seed)
    if init_state is not None:
        net.set_state(init_state)

    steps_per_epoch = math.ceil(len(train_idx) / batch_size)
    total_steps = epochs * steps_per_epoch
    m = [np.zeros_like(p) for p in net.W + net.b]
    v = [np.zeros_like(p) for p in net.W + net.b]
    beta1, beta2, eps = 0.9, 0.999, 1e-8
    step = 0
    logger(
        f"Red: {net.n_params():,} parámetros | {len(train_idx):,} train / {len(val_idx):,} val | "
        f"{epochs} épocas x {steps_per_epoch} pasos"
    )

    best_loss, best_state, best_metrics, bad_epochs, epochs_run = float("inf"), None, {}, 0, 0
    n_layers = len(net.W)
    for epoch in range(1, epochs + 1):
        order = rng.permutation(train_idx)
        running, seen = 0.0, 0
        for start in range(0, len(order), batch_size):
            b = np.sort(order[start:start + batch_size])  # lectura de memoria más ordenada
            loss, gW, gb = net.loss_and_grads(make_input(X[b], E[b]), Y[b])
            running += loss * len(b)
            seen += len(b)

            step += 1
            cur_lr = _lr_at(step - 1, total_steps, lr)
            c1, c2 = 1 - beta1 ** step, 1 - beta2 ** step
            params = net.W + net.b
            grads = gW + gb
            for k, (p, g) in enumerate(zip(params, grads)):
                m[k] *= beta1
                m[k] += (1 - beta1) * g
                v[k] *= beta2
                v[k] += (1 - beta2) * (g * g)
                if k < n_layers and weight_decay:  # decaimiento solo en matrices, no en sesgos
                    p *= 1 - cur_lr * weight_decay
                p -= (cur_lr / c1) * m[k] / (np.sqrt(v[k] / c2) + eps)

        metrics = evaluate(net, X, E, Y, val_idx)
        epochs_run = epoch
        logger(
            f"  época {epoch}/{epochs} | loss train {running / seen:.4f} | val {metrics['val_loss']:.4f} | "
            f"top1 {metrics['top1']:.3f} | top3 {metrics['top3']:.3f}"
        )
        if metrics["val_loss"] < best_loss - 1e-4:
            best_loss, best_metrics, bad_epochs = metrics["val_loss"], metrics, 0
            best_state = net.get_state()
        else:
            bad_epochs += 1
            if bad_epochs >= patience:
                logger("  sin mejora en validación: corte anticipado")
                break

    if best_state is not None:
        net.set_state(best_state)
    summary = {
        "samples": int(len(Y)),
        "val_samples": int(len(val_idx)),
        "epochs_run": int(epochs_run),
        "params": net.n_params(),
        "val_loss": round(float(best_metrics["val_loss"]), 4),
        "top1": round(float(best_metrics["top1"]), 4),
        "top3": round(float(best_metrics["top3"]), 4),
        "seconds": round(time.perf_counter() - started, 1),
    }
    return net, summary


#  guardado / carga
def save_net(net: PolicyNet, path: Path, metrics: Optional[dict] = None) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    arrays = {f"W{i}": w for i, w in enumerate(net.W)}
    arrays.update({f"b{i}": b for i, b in enumerate(net.b)})
    arrays["meta"] = np.array(json.dumps({"config": net.config, "metrics": metrics or {}, "version": 2}))
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "wb") as fh:  # con un handle numpy no le agrega ".npz" al nombre
        np.savez_compressed(fh, **arrays)
    os.replace(tmp, path)  # reemplazo atómico: el servicio nunca lee un archivo a medio escribir


def load_checkpoint(path: Path) -> dict:
    """Devuelve {"state_dict": {"W": [...], "b": [...]}, "config": {...}, "metrics": {...}}."""
    with np.load(Path(path), allow_pickle=False) as z:
        meta = json.loads(str(z["meta"]))
        n_layers = len(meta["config"]["hidden"]) + 1
        state = {"W": [z[f"W{i}"] for i in range(n_layers)], "b": [z[f"b{i}"] for i in range(n_layers)]}
    return {"state_dict": state, "config": meta["config"], "metrics": meta.get("metrics", {})}


def load_net(path: Path) -> Tuple[PolicyNet, dict]:
    ckpt = load_checkpoint(path)
    net = PolicyNet(**ckpt["config"])
    net.set_state(ckpt["state_dict"])
    return net, ckpt["metrics"]
