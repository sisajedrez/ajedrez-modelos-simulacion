import chess

from app.openings import OPENING_TABLE, build_table, opening_candidates
from app.predictor import Predictor
from conftest import forced_net

START = chess.Board()
ODD = chess.Board("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1")  # sin red útil ni apertura


def test_opening_table_is_all_legal():
    for key, moves in OPENING_TABLE.items():
        board = chess.Board(key + " 0 1")
        assert set(moves) <= {m.uci() for m in board.legal_moves}, key


def test_build_table_rejects_illegal_line():
    import pytest
    with pytest.raises(ValueError):
        build_table([["e2e5"]])


def test_history_move_comes_from_the_network(rng):
    p = Predictor("/nonexistent", rng=rng)
    p.net = forced_net({"e2e4": 10.0, "d2d4": 8.0})
    assert p.predict(START, "DIFICIL") == ("e2e4", "history")


def test_medio_samples_between_top_moves(rng):
    p = Predictor("/nonexistent", rng=rng)
    p.net = forced_net({"e2e4": 10.0, "d2d4": 8.0})
    picks = [p.predict(START, "MEDIO")[0] for _ in range(1500)]
    assert set(picks) == {"e2e4", "d2d4"}
    assert 0.80 < picks.count("e2e4") / len(picks) < 0.95  # ~ e^2/(1+e^2) = 0.88


def test_legal_probs_ignore_illegal_moves_and_renormalize(rng):
    p = Predictor("/nonexistent", rng=rng)
    # a7a5 es ilegal para blancas y tiene logit alto, pero e2e4 sigue teniendo masa suficiente
    p.net = forced_net({"e2e4": 10.0, "a7a5": 10.0})
    probs = p.legal_probs(START, "DIFICIL")
    assert set(p_ for p_ in probs if probs[p_] > 0.01) == {"e2e4"}
    assert abs(sum(probs.values()) - 1) < 1e-6


def test_low_legal_mass_falls_back_to_openings(rng):
    p = Predictor("/nonexistent", rng=rng)
    p.net = forced_net({"a7a5": 10.0, "h7h5": 10.0})  # toda la masa sobre jugadas ilegales
    move, source = p.predict(START, "MEDIO")
    assert source == "openings" and move in opening_candidates(START)


def test_untrained_network_falls_back(rng):
    from app.nn import PolicyNet
    p = Predictor("/nonexistent", rng=rng)
    p.net = PolicyNet(hidden=(16,))  # pesos al azar: casi nada de masa legal
    assert p.predict(START, "FACIL")[1] in ("openings", "history")


def test_no_network_uses_openings_then_none(rng):
    p = Predictor("/nonexistent", rng=rng)
    move, source = p.predict(START, "FACIL")
    assert source == "openings" and chess.Move.from_uci(move) in START.legal_moves
    assert p.predict(ODD, "FACIL") == (None, "none")
    assert p.status() == {"policy_net": False}


def test_promotion_is_played_as_queen(rng):
    board = chess.Board("8/4P3/8/8/8/8/k7/4K3 w - - 0 1")
    p = Predictor("/nonexistent", rng=rng)
    p.net = forced_net({"e7e8q": 10.0})
    assert p.predict(board, "DIFICIL") == ("e7e8q", "history")


def test_load_from_disk(tmp_path, rng):
    from app.nn import MODEL_FILENAME, save_net
    save_net(forced_net({"e2e4": 10.0}), tmp_path / MODEL_FILENAME)
    p = Predictor(tmp_path, rng=rng)
    p.load()
    assert p.status() == {"policy_net": True}
    assert p.predict(START, "DIFICIL") == ("e2e4", "history")
