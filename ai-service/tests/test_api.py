import chess
import pytest
from fastapi.testclient import TestClient

from app import main
from conftest import forced_net

START = chess.Board()


@pytest.fixture
def client():
    with TestClient(main.app) as c:
        main.predictor.net = forced_net({"d2d4": 10.0})
        yield c
        main.predictor.net = None


def test_predict_history(client):
    r = client.post("/predict-move", json={"fen": START.fen(), "difficulty": "Difícil", "elo": 1900})
    assert r.status_code == 200
    assert r.json() == {"move": "d2d4", "source": "history", "level": "DIFICIL"}


def test_predict_openings_without_network(client):
    main.predictor.net = None
    r = client.post("/predict-move", json={"fen": START.fen(), "elo": 900})
    body = r.json()
    assert body["source"] == "openings" and body["level"] == "FACIL"


def test_predict_none(client):
    main.predictor.net = None
    r = client.post("/predict-move", json={"fen": "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", "difficulty": "Medio"})
    assert r.json()["move"] is None and r.json()["source"] == "none"


def test_invalid_inputs(client):
    assert client.post("/predict-move", json={"fen": "basura", "elo": 1000}).status_code == 422
    assert client.post("/predict-move", json={"fen": START.fen()}).status_code == 422
    mate = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"
    assert client.post("/predict-move", json={"fen": mate, "elo": 1000}).status_code == 422


def test_health_reports_network(client):
    body = client.get("/health").json()
    assert body["status"] == "ok" and body["models"] == {"policy_net": True}
