
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Dict, Tuple

import pandas as pd

# Permite `python training/train_csv.py` además de `python -m training.train_csv`.
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import parse_hidden, settings  # noqa: E402
from app.nn import MODEL_FILENAME, encode_samples, save_net, train_net  # noqa: E402

LEVELS = ("facil", "medio", "dificil")
# (límite inferior exclusivo, límite superior inclusivo)
LIMITS: Dict[str, Tuple[int | None, int | None]] = {
    "facil": (None, 1250),
    "medio": (1250, 1750),
    "dificil": (1750, None),
}


def log(message: str) -> None:
    print(message, flush=True)


def level_mask(elo: pd.Series, level: str) -> pd.Series:
    lower, upper = LIMITS[level]
    mask = elo.notna()
    if lower is not None:
        mask &= elo > lower
    if upper is not None:
        mask &= elo <= upper
    return mask


def cache_is_valid(cache_path: Path, csv_path: Path, payload: dict) -> bool:
    if not cache_path.exists():
        return False
    try:
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    stat = csv_path.stat()
    return (
        cached.get("csv") == str(csv_path.resolve())
        and cached.get("size") == stat.st_size
        and cached.get("mtime") == int(stat.st_mtime)
        and cached.get("counts") == payload.get("counts")
    )


def count_rows_by_level(csv_path: Path, chunk_size: int) -> Tuple[dict, int]:
    counts = {level: 0 for level in LEVELS}
    total = 0
    started = time.perf_counter()
    log(f"Contando filas por nivel en {csv_path} ...")
    for chunk in pd.read_csv(csv_path, usecols=["elo"], chunksize=chunk_size):
        elo = pd.to_numeric(chunk["elo"], errors="coerce")
        for level in LEVELS:
            counts[level] += int(level_mask(elo, level).sum())
        total += len(chunk)
        if total % (chunk_size * 10) == 0:
            log(f"  {total:,} filas leídas")
    log(f"Conteo terminado en {time.perf_counter() - started:.1f}s: {counts} ({total:,} filas)")
    return counts, total


def load_or_count(
    csv_path: Path,
    chunk_size: int,
    cache_path: Path,
    refresh: bool,
    expected: dict | None = None,
) -> Tuple[dict, int]:
    if not refresh and expected and cache_is_valid(cache_path, csv_path, expected):
        log(f"Usando conteo cacheado: {cache_path}")
        return expected["counts"], expected["total"]
    counts, total = count_rows_by_level(csv_path, chunk_size)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    stat = csv_path.stat()
    cache_path.write_text(
        json.dumps(
            {
                "csv": str(csv_path.resolve()),
                "size": stat.st_size,
                "mtime": int(stat.st_mtime),
                "counts": counts,
                "total": total,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return counts, total


def sample_rows(
    csv_path: Path,
    counts: dict,
    max_rows_per_level: int,
    chunk_size: int,
    seed: int,
) -> Dict[str, pd.DataFrame]:
    fractions = {
        level: (max_rows_per_level / counts[level] if counts[level] else 0.0)
        for level in LEVELS
    }
    log(f"Muestreando hasta {max_rows_per_level:,} filas por nivel ...")
    buckets: Dict[str, list[pd.DataFrame]] = {level: [] for level in LEVELS}
    total_seen = 0
    started = time.perf_counter()

    for chunk_index, chunk in enumerate(
        pd.read_csv(csv_path, usecols=["fen", "move", "elo"], chunksize=chunk_size)
    ):
        chunk["elo"] = pd.to_numeric(chunk["elo"], errors="coerce")
        chunk = chunk.dropna(subset=["fen", "move", "elo"]).copy()
        total_seen += len(chunk)

        for level_index, level in enumerate(LEVELS):
            if fractions[level] <= 0:
                continue
            part = chunk.loc[level_mask(chunk["elo"], level), ["fen", "move", "elo"]]
            if part.empty:
                continue
            # Se pide un 10% extra y se recorta al final para compensar el redondeo.
            target = max(1, int(round(len(part) * fractions[level] * 1.10)))
            if target < len(part):
                part = part.sample(
                    n=target, random_state=seed + chunk_index * 100 + level_index
                )
            buckets[level].append(part)

        if total_seen % (chunk_size * 10) == 0:
            log(f"  {total_seen:,} filas procesadas")

    samples: Dict[str, pd.DataFrame] = {}
    for level in LEVELS:
        parts = buckets[level]
        frame = (
            pd.concat(parts, ignore_index=True)
            if parts
            else pd.DataFrame(columns=["fen", "move", "elo"])
        )
        if len(frame) > max_rows_per_level:
            frame = frame.sample(n=max_rows_per_level, random_state=seed)
        samples[level] = frame
        log(f"  {level}: {len(frame):,} muestras")

    log(f"Muestreo terminado en {time.perf_counter() - started:.1f}s")
    return samples


def train_network(samples: Dict[str, pd.DataFrame], args: argparse.Namespace) -> dict:
    frame = pd.concat([samples[level] for level in LEVELS], ignore_index=True)
    if len(frame) < settings.train_min_rows:
        return {
            "status": "skipped",
            "reason": f"pocas muestras ({len(frame)} < {settings.train_min_rows})",
        }

    started = time.perf_counter()
    log(f"Vectorizando {len(frame):,} muestras ...")
    X, E, Y, invalid = encode_samples(
        frame["fen"].to_numpy(),
        frame["move"].to_numpy(),
        frame["elo"].to_numpy(),
        progress=lambda i: log(f"    vectorizadas {i:,} filas"),
    )
    del frame
    if len(Y) < settings.train_min_rows:
        return {
            "status": "skipped",
            "reason": f"pocas muestras válidas ({len(Y)} < {settings.train_min_rows})",
        }
    log(f"Dataset en memoria: {X.nbytes / 1024**2:.0f} MiB ({len(Y):,} filas, {invalid} inválidas)")

    net, metrics = train_net(
        X, E, Y,
        config={"hidden": parse_hidden(args.hidden)},
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        val_fraction=args.val_fraction,
        seed=args.seed,
        logger=log,
    )
    metrics["invalid_rows"] = int(invalid)
    metrics["mode"] = "from-scratch"
    metrics["per_level"] = {level: int(len(samples[level])) for level in LEVELS}
    path = Path(args.models_dir) / MODEL_FILENAME
    save_net(net, path, metrics)
    metrics["total_seconds"] = round(time.perf_counter() - started, 1)
    return {"status": "trained", **metrics, "file": str(path)}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Entrena la red neuronal desde un CSV.")
    parser.add_argument("--csv", default=settings.train_csv_path, help="Ruta del CSV.")
    parser.add_argument(
        "--max-rows-per-level",
        type=int,
        default=settings.train_max_rows_per_level,
        help="Tope de muestras por nivel.",
    )
    parser.add_argument(
        "--models-dir",
        default=str(settings.models_dir),
        help="Directorio de salida de policy_net.pt.",
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=settings.train_chunk_size,
        help="Filas por bloque de lectura.",
    )
    parser.add_argument("--epochs", type=int, default=settings.nn_epochs)
    parser.add_argument("--batch-size", type=int, default=settings.nn_batch_size)
    parser.add_argument("--lr", type=float, default=settings.nn_lr)
    parser.add_argument(
        "--hidden", default=settings.nn_hidden, help="Capas ocultas, p. ej. 512,512 o 1024,512,256."
    )
    parser.add_argument("--val-fraction", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--counts-cache",
        default="training/out/row_counts.json",
        help="Caché del conteo por nivel.",
    )
    parser.add_argument(
        "--refresh-counts",
        action="store_true",
        help="Ignora la caché y vuelve a contar el CSV.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Solo cuenta y muestrea, sin entrenar.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    csv_path = Path(args.csv)
    cache_path = Path(args.counts_cache)

    if not csv_path.exists():
        log(f"ERROR: no existe el CSV: {csv_path.resolve()}")
        return 2
    if args.max_rows_per_level < settings.train_min_rows:
        log(
            f"ERROR: --max-rows-per-level ({args.max_rows_per_level}) es menor que "
            f"TRAIN_MIN_ROWS ({settings.train_min_rows})"
        )
        return 2

    stat = csv_path.stat()
    expected = None
    if cache_path.exists():
        try:
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            if (
                cached.get("csv") == str(csv_path.resolve())
                and cached.get("size") == stat.st_size
                and cached.get("mtime") == int(stat.st_mtime)
            ):
                expected = cached
        except (OSError, ValueError):
            expected = None

    counts, total = load_or_count(
        csv_path, args.chunk_size, cache_path, args.refresh_counts, expected
    )
    if not any(counts.values()):
        log("ERROR: no se encontraron filas con ELO en los rangos esperados.")
        return 2

    log(
        f"CSV: {csv_path.resolve()} ({total:,} filas, {stat.st_size / 1024**3:.2f} GiB)"
    )
    samples = sample_rows(
        csv_path, counts, args.max_rows_per_level, args.chunk_size, args.seed
    )

    if args.dry_run:
        report = {level: {"samples": int(len(frame))} for level, frame in samples.items()}
    else:
        report = train_network(samples, args)

    report_path = cache_path.parent / "train_report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(
            {
                "csv": str(csv_path.resolve()),
                "max_rows_per_level": args.max_rows_per_level,
                "counts": counts,
                "report": report,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    log(f"Reporte: {report_path.resolve()}")
    log(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
