import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

def entrenar_modelo_desde_binario(archivo_npz: str, nombre_modelo_salida: str):
    """
    Carga el .npz directamente a la RAM, entrena y guarda el .joblib
    """
    print(f"\n--- Entrenando {nombre_modelo_salida} desde {archivo_npz} ---")
    try:
        datos = np.load(archivo_npz)
    except FileNotFoundError:
        print(f" No se encontró {archivo_npz}. ¿Corriste el procesador?")
        return

    X = datos['features']
    y = datos['labels']
    
    print(f"Total de muestras: {X.shape[0]}. Dividiendo train/test...")
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.15, random_state=42)
    
    # Hiperparámetros base (podés tunearlos más adelante)
    clf = RandomForestClassifier(
        n_estimators=60,
        max_depth=15,
        min_samples_split=5,
        random_state=42,
        n_jobs=-1 # Paralelización al máximo
    )
    clf.fit(X_train, y_train)
    
    predicciones = clf.predict(X_test)
    precision = accuracy_score(y_test, predicciones)
    print(f"🎯 Precisión en validación: {precision:.4f}")
    
    archivo_final = f"{nombre_modelo_salida}.joblib"
    joblib.dump(clf, archivo_final)
    print(f" Artefacto guardado: {archivo_final}")

if __name__ == "__main__":
    # Entrenamos las tres dificultades automáticamente
    modelos_a_entrenar = [
        ("matrices_facil.npz", "modelo_ia_facil"),
        ("matrices_medio.npz", "modelo_ia_medio"),
        ("matrices_dificil.npz", "modelo_ia_dificil")
    ]

    for archivo, salida in modelos_a_entrenar:
        entrenar_modelo_desde_binario(archivo, salida)
        
    print("\n Todos los modelos están listos para integrarse en la API.")