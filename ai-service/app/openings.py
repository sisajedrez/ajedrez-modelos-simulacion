"""Tabla básica de aperturas precargada (fallback de RN-02).
"""
from collections import defaultdict
from typing import Dict, List

import chess

OPENING_LINES: List[List[str]] = [
    "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6".split(),
    "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5".split(),
    "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4".split(),
    "e2e4 e7e6 d2d4 d7d5 b1c3 g8f6".split(),
    "e2e4 c7c6 d2d4 d7d5 b1c3 d5e4".split(),
    "d2d4 d7d5 c2c4 e7e6 b1c3 g8f6".split(),
    "d2d4 g8f6 c2c4 e7e6 b1c3 f8b4".split(),
    "g1f3 d7d5 d2d4 g8f6 c2c4 e7e6".split(),
    "c2c4 e7e5 b1c3 g8f6 g1f3 b8c6".split(),
]


def simple_fen(fen: str) -> str:
    return " ".join(fen.split()[:4])


def build_table(lines: List[List[str]] = OPENING_LINES) -> Dict[str, List[str]]:
    table: Dict[str, List[str]] = defaultdict(list)
    for line in lines:
        board = chess.Board()
        for uci in line:
            key = simple_fen(board.fen())
            if uci not in table[key]:
                table[key].append(uci)
            board.push_uci(uci)  
    return dict(table)


OPENING_TABLE = build_table()


def opening_candidates(board: chess.Board) -> List[str]:
    legal = {m.uci() for m in board.legal_moves}
    return [m for m in OPENING_TABLE.get(simple_fen(board.fen()), []) if m in legal]
