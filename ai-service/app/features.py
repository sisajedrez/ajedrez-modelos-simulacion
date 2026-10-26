"""Vectorización FEN -> 773 features
"""
import chess
import numpy as np

N_FEATURES = 773

_PIECE_TO_IDX = {
    "P": 0, "N": 1, "B": 2, "R": 3, "Q": 4, "K": 5,
    "p": 6, "n": 7, "b": 8, "r": 9, "q": 10, "k": 11,
}


def fen_a_matriz_onehot(fen: str) -> np.ndarray:
    board = chess.Board(fen)
    return board_a_features(board)


def board_a_features(board: chess.Board) -> np.ndarray:
    features = np.zeros(N_FEATURES, dtype=np.float32)

    for square, piece in board.piece_map().items():
        features[_PIECE_TO_IDX[piece.symbol()] * 64 + square] = 1.0

    features[768] = 1.0 if board.turn == chess.WHITE else 0.0
    features[769] = 1.0 if board.has_kingside_castling_rights(chess.WHITE) else 0.0
    features[770] = 1.0 if board.has_queenside_castling_rights(chess.WHITE) else 0.0
    features[771] = 1.0 if board.has_kingside_castling_rights(chess.BLACK) else 0.0
    features[772] = 1.0 if board.has_queenside_castling_rights(chess.BLACK) else 0.0
    return features
