
import csv
import sys

import chess
import chess.pgn


def convertir_pgn_a_csv(ruta_pgn: str, ruta_csv: str, max_partidas: int = 5000):
    procesadas = 0
    filas = 0
    with open(ruta_pgn, "r", encoding="utf-8", errors="replace") as pgn_file, \
            open(ruta_csv, "w", newline="", encoding="utf-8") as out:
        writer = csv.writer(out)
        writer.writerow(["fen", "move", "elo", "color", "result"])
        while procesadas < max_partidas:
            game = chess.pgn.read_game(pgn_file)
            if game is None:
                break
            try:
                white_elo = int(game.headers.get("WhiteElo", 0))
                black_elo = int(game.headers.get("BlackElo", 0))
            except ValueError:
                continue
            result = game.headers.get("Result", "*")
            if white_elo == 0 or black_elo == 0 or result not in ("1-0", "0-1", "1/2-1/2"):
                continue

            board = game.board()
            for move in game.mainline_moves():
                white = board.turn == chess.WHITE
                writer.writerow([board.fen(), move.uci(), white_elo if white else black_elo,
                                 "WHITE" if white else "BLACK", result])
                filas += 1
                board.push(move)

            procesadas += 1
            if procesadas % 500 == 0:
                print(f"Procesadas {procesadas} partidas ({filas} posiciones)...")

    print(f"Listo: {procesadas} partidas, {filas} posiciones en {ruta_csv}")


if __name__ == "__main__":
    entrada = sys.argv[1] if len(sys.argv) > 1 else "datasetchess.pgn"
    salida = sys.argv[2] if len(sys.argv) > 2 else "datasetchess.csv"
    maximo = int(sys.argv[3]) if len(sys.argv) > 3 else 1000
    convertir_pgn_a_csv(entrada, salida, maximo)
