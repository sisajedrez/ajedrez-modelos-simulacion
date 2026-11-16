
import logging
from contextlib import asynccontextmanager
from typing import Optional

import chess
import psycopg2
from fastapi import BackgroundTasks, FastAPI, HTTPException
from pydantic import BaseModel

from .config import settings
from .db import get_conn
from .policies import normalize_level
from .predictor import Predictor
from .seed import seed_dataset
from .train import TrainManager

logging.basicConfig(level=logging.INFO)

predictor = Predictor(settings.models_dir, settings.min_legal_prob)
trainer = TrainManager()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    predictor.load()
    yield


app = FastAPI(title="AI Service - Ajedrez UNViMe", lifespan=lifespan)


class PredictRequest(BaseModel):
    fen: str
    difficulty: Optional[str] = None
    elo: Optional[int] = None


class PredictResponse(BaseModel):
    move: Optional[str]  # UCI (e2e4, e7e8q). null cuando source == "none"
    source: str  # "history" | "openings" | "none"
    level: str


class SeedRequest(BaseModel):
    path: Optional[str] = None
    max_games: Optional[int] = None
    force: bool = False


@app.get("/health")
def health():
    db_ok = "disabled"
    if settings.db_enabled:
        try:
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("SELECT 1")
            db_ok = True
        except Exception:
            db_ok = False
    return {"status": "ok", "models": predictor.status(), "db": db_ok}


@app.post("/model/reload")
def model_reload():
    predictor.load()
    return {"status": "reloaded", "models": predictor.status()}


@app.post("/predict-move", response_model=PredictResponse)
def predict_move(req: PredictRequest):
    try:
        board = chess.Board(req.fen)
    except ValueError:
        raise HTTPException(status_code=422, detail="FEN inválido")
    if board.is_game_over():
        raise HTTPException(status_code=422, detail="La partida ya terminó: no hay jugadas legales")
    try:
        level = normalize_level(req.difficulty, req.elo)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    move, source = predictor.predict(board, level, req.elo)
    return PredictResponse(move=move, source=source, level=level)


@app.post("/dataset/seed")
def dataset_seed(req: Optional[SeedRequest] = None):
    req = req or SeedRequest()
    try:
        return seed_dataset(
            req.path or settings.seed_pgn_path,
            req.max_games or settings.seed_max_games,
            req.force,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"PGN no encontrado: {exc.filename}")
    except psycopg2.OperationalError as exc:
        raise HTTPException(status_code=503, detail=f"Base de datos no disponible: {exc}")


@app.post("/model/train", status_code=202)
def model_train(background: BackgroundTasks):
    if not trainer.begin():
        raise HTTPException(status_code=409, detail="Ya hay un entrenamiento en curso")
    background.add_task(trainer.run, predictor)
    return {"status": "started"}


@app.get("/model/status")
def model_status():
    return {"training": trainer.state, "models": predictor.status()}
