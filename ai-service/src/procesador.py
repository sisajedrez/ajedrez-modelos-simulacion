import pandas as pd
import numpy as np
from extractor import fen_a_matriz_onehot

def procesar_y_guardar_binario(df_particion, nombre_salida):
    """Convierte un dataframe filtrado en matrices homogéneas y lo guarda en .npz"""
    X_list = []
    y_list = []
    
    print(f"Vectorizando {len(df_particion)} posiciones para {nombre_salida}...")
    for _, fila in df_particion.iterrows():
        try:
            matriz = fen_a_matriz_onehot(fila['fen'])
            X_list.append(matriz)
            y_list.append(fila['move'])
        except Exception:
            continue # Ignorar FENs inválidos

    # Matrices homogéneas ultra rápidas
    X = np.array(X_list, dtype=np.float32)
    y = np.array(y_list, dtype=str)
    
    np.savez_compressed(f"{nombre_salida}.npz", features=X, labels=y)
    print(f" Guardado: {nombre_salida}.npz | Shape X: {X.shape}")

def generar_datasets_por_dificultad(datasetchess: str, col_elo: str = 'elo'):
    """
    Lee el dataset completo, lo filtra por rangos de ELO y genera 
    un archivo binario independiente para cada dificultad.
    """
    print(f"Cargando dataset gigante desde {datasetchess}...")
    df = pd.read_csv(datasetchess)
    df = df.dropna(subset=['fen', 'move', col_elo])
    
    print(f"Total de registros crudos: {len(df)}")

    # 1. Aplicamos los filtros de Pandas según el ELO
    # (Ajustá estos números según los umbrales que quieras manejar)
    df_facil = df[df[col_elo] <= 1200]
    df_medio = df[(df[col_elo] > 1200) & (df[col_elo] <= 1700)]
    df_dificil = df[df[col_elo] > 1700]

    # 2. Procesamos y guardamos cada porción
    print("\n--- Procesando Dificultad: FÁCIL ---")
    procesar_y_guardar_binario(df_facil, "matrices_facil")

    print("\n--- Procesando Dificultad: MEDIO ---")
    procesar_y_guardar_binario(df_medio, "matrices_medio")

    print("\n--- Procesando Dificultad: DIFÍCIL ---")
    procesar_y_guardar_binario(df_dificil, "matrices_dificil")
    
    print("\n Todos los datasets fueron generados con éxito.")

if __name__ == "__main__":
    # Cambiá el nombre del archivo al de tu CSV original
    generar_datasets_por_dificultad("datasetchess.csv", col_elo="elo")