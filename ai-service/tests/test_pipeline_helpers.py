import chess
import pytest

from app.seed import _game_rows, parse_elo
from app.train import san_to_uci, winner_color
import chess.pgn
import io

PGN = """[Event "t"]
[White "A"]
[Black "B"]
[Result "1-0"]
[WhiteElo "1500"]
[BlackElo "1400"]

1. e4 e5 2. Nf3 Nc6 1-0
"""


def test_san_to_uci():
    fen = chess.STARTING_FEN
    assert san_to_uci(fen, "e4") == "e2e4"
    assert san_to_uci(fen, "Nf3") == "g1f3"
    assert san_to_uci(fen, "Qh9") is None
    promo = "8/4P3/8/8/8/8/k7/4K3 w - - 0 1"
    assert san_to_uci(promo, "e8=Q+") == "e7e8q"


def test_winner_color():
    assert winner_color("1-0") == "WHITE"
    assert winner_color("0-1") == "BLACK"
    assert winner_color("Tablas") is None and winner_color(None) is None


def test_parse_elo():
    assert parse_elo("1500") == 1500 and parse_elo("?") is None and parse_elo(None) is None


def test_game_rows():
    game = chess.pgn.read_game(io.StringIO(PGN))
    header, moves, final_fen, avg = _game_rows(game)
    assert header["result"] == "1-0" and avg == 1450 and len(moves) == 4
    assert moves[0][:3] == (1, "WHITE", "e4") and moves[1][1] == "BLACK"
    assert moves[0][3] == chess.STARTING_FEN


def test_game_without_elo_is_skipped():
    game = chess.pgn.read_game(io.StringIO(PGN.replace('[WhiteElo "1500"]\n', "")))
    assert _game_rows(game) is None
