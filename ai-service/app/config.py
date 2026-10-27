"""Configuración del servicio"""
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off", ""}


@dataclass(frozen=True)
class Settings:
    host: str = os.getenv("HOST", os.getenv("AI_HOST", "127.0.0.1"))
    port: int = int(os.getenv("PORT", os.getenv("AI_PORT", "8000")))
    database_url: str = os.getenv(
        "DATABASE_URL", "postgresql://postgres@127.0.0.1:5434/ajedrez_db"
    )
    db_enabled: bool = _env_bool("DB_ENABLED", True)
    db_connect_timeout: int = int(os.getenv("DB_CONNECT_TIMEOUT", "2"))
    models_dir: Path = Path(os.getenv("MODELS_DIR", "./models"))
    # Si la probabilidad total sobre jugadas legales queda por debajo => source "none"
    min_legal_prob: float = float(os.getenv("MIN_LEGAL_PROB", "0.05"))
    seed_pgn_path: str = os.getenv("SEED_PGN_PATH", "./data/datasetchess.pgn")
    seed_max_games: int = int(os.getenv("SEED_MAX_GAMES", "5000"))
    # Entrenamiento offline desde CSV
    train_csv_path: str = os.getenv("TRAIN_CSV_PATH", "./data/datasetchess.csv")
    train_max_rows_per_level: int = int(os.getenv("TRAIN_MAX_ROWS_PER_LEVEL", "100000"))
    train_min_rows: int = int(os.getenv("TRAIN_MIN_ROWS", "200"))
    train_chunk_size: int = int(os.getenv("TRAIN_CHUNK_SIZE", "500000"))
    # Entrenamiento desde la base de datos
    db_train_max_rows_per_level: int = int(
        os.getenv("DB_TRAIN_MAX_ROWS_PER_LEVEL", "150000")
    )
    # Red neuronal (app/nn.py)
    nn_hidden: str = os.getenv("NN_HIDDEN", "512,512")  # tamaños de las capas ocultas
    nn_epochs: int = int(os.getenv("NN_EPOCHS", "8"))
    nn_batch_size: int = int(os.getenv("NN_BATCH_SIZE", "512"))
    nn_lr: float = float(os.getenv("NN_LR", "0.001"))
    # Reentrenamiento desde la BD: continúa desde la red actual con pasos más suaves
    nn_finetune_epochs: int = int(os.getenv("NN_FINETUNE_EPOCHS", "3"))
    nn_finetune_lr: float = float(os.getenv("NN_FINETUNE_LR", "0.0003"))


def parse_hidden(value: str):
    """'512,512' -> [512, 512]"""
    sizes = [int(p) for p in str(value).replace("x", ",").split(",") if p.strip()]
    if not sizes or any(n < 8 for n in sizes):
        raise ValueError(f"NN_HIDDEN inválido: {value!r} (ejemplo: 512,512)")
    return sizes


settings = Settings()
