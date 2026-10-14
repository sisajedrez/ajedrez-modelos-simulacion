import numpy as np
import chess

def fen_a_matriz_onehot(fen: str) -> np.ndarray:
    """
    Convierte un FEN en un vector numérico One-Hot de 773 dimensiones.
    Crea 12 'capas' (una por tipo de pieza y color), más turno y enroques.
    """
    board = chess.Board(fen)
    features = np.zeros(773, dtype=np.float32)

    piece_to_idx = {
        'P': 0, 'N': 1, 'B': 2, 'R': 3, 'Q': 4, 'K': 5,   # Blancas
        'p': 6, 'n': 7, 'b': 8, 'r': 9, 'q': 10, 'k': 11  # Negras
    }

    # 1. Mapeo de las piezas
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece is not None:
            capa_idx = piece_to_idx[piece.symbol()]
            posicion_vector = (capa_idx * 64) + square
            features[posicion_vector] = 1.0

    # 2. Turno (índice 768)
    features[768] = 1.0 if board.turn == chess.WHITE else 0.0

    # 3. Derechos de enroque (índices 769 a 772)
    features[769] = 1.0 if board.has_kingside_castling_rights(chess.WHITE) else 0.0
    features[770] = 1.0 if board.has_queenside_castling_rights(chess.WHITE) else 0.0
    features[771] = 1.0 if board.has_kingside_castling_rights(chess.BLACK) else 0.0
    features[772] = 1.0 if board.has_queenside_castling_rights(chess.BLACK) else 0.0

    return features