import chess.pgn
import pandas as pd

def convertir_pgn_a_csv(ruta_pgn: str, ruta_csv: str, max_partidas: int = 5000):
    """
    Lee un archivo PGN, extrae cada posición (FEN), la jugada (UCI) 
    y el ELO del jugador activo, y lo guarda en un CSV.
    """
    datos = []
    partidas_procesadas = 0

    print(f"Abriendo {ruta_pgn}...")
    
    with open(ruta_pgn, "r", encoding="utf-8") as pgn_file:
        while partidas_procesadas < max_partidas:
            game = chess.pgn.read_game(pgn_file)
            if game is None:
                break  # Fin del archivo alcanzado

            # 1. Extraer los ELOs desde las cabeceras del PGN
            try:
                white_elo = int(game.headers.get("WhiteElo", 0))
                black_elo = int(game.headers.get("BlackElo", 0))
            except ValueError:
                # Si el ELO tiene un formato raro como "?" lo salteamos
                continue

            # Si la partida no tiene ELO registrado, la descartamos
            if white_elo == 0 or black_elo == 0:
                continue

            # 2. Recorrer cada movimiento de la partida
            board = game.board()
            for move in game.mainline_moves():
                # Capturar el estado actual ANTES de mover
                fen_actual = board.fen()
                jugada_uci = move.uci()
                
                # Asignar el ELO del jugador al que le toca mover en este turno
                elo_jugador = white_elo if board.turn == chess.WHITE else black_elo

                # Guardar el registro
                datos.append({
                    "fen": fen_actual,
                    "move": jugada_uci,
                    "elo": elo_jugador
                })

                # Avanzar el tablero al siguiente turno
                board.push(move)

            partidas_procesadas += 1
            
            if partidas_procesadas % 500 == 0:
                print(f"Procesadas {partidas_procesadas} partidas...")

    # 3. Exportar todo a CSV usando Pandas
    print("\nGenerando DataFrame y guardando CSV...")
    df = pd.DataFrame(datos)
    
    # Descartar duplicados (posiciones idénticas jugadas de la misma manera por el mismo ELO)
    df = df.drop_duplicates()
    
    df.to_csv(ruta_csv, index=False)
    print(f" Extracción completada. Archivo guardado como: {ruta_csv}")
    print(f" Total de posiciones extraídas: {len(df)}")

if __name__ == "__main__":
    # Colocá la ruta a tu archivo .pgn crudo acá
    archivo_entrada = "datasetchess.pgn"
    archivo_salida = "datasetchess.csv"
    
    # Te sugiero dejarle un límite de partidas para probar que funcione rápido,
    # y cuando veas que el CSV sale bien, le ponés max_partidas=1000000
    convertir_pgn_a_csv(archivo_entrada, archivo_salida, max_partidas=1000)