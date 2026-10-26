# ai-service (IA propia, puerto 8000)

Servicio FastAPI que decide la jugada de la IA propia (RN-02, CU-04). El Backend (Node) lo consume por HTTP
(`AI_SERVICE_URL`, por defecto `http://127.0.0.1:8000`). **No necesita Stockfish**: si responde `source: "none"`,
el Backend usa su respaldo con Stockfish nivel 0.

## Arranque

```bash
cd ai-service
pip install -r requirements.txt
cp .env.example .env              # ajustar DATABASE_URL
# poner la red entrenada en ./models/policy_net.npz (ver "Entrenamiento")
python -m uvicorn app.main:app --port 8000
python -m pytest                  # 48 tests
```

Sin `policy_net.npz` el servicio igual arranca: responde con la tabla de aperturas y, fuera de ella, `none`.

## Contrato

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | `{status, models:{policy_net}, db}` (`db` es `"disabled"` si `DB_ENABLED=false`) |
| POST | `/predict-move` | `{fen, difficulty?, elo?}` -> `{move, source, level}` |
| POST | `/dataset/seed` | Carga PGN a la BD (RN-04). Body opcional `{path, max_games, force}` |
| POST | `/model/train` | Reentrena en segundo plano (202). Solo partidas `FINALIZADA` (RN-01) |
| POST | `/model/reload` | Vuelve a leer `policy_net.npz` sin reiniciar el servicio |
| GET | `/model/status` | Estado del entrenamiento y de la red cargada |

- `move` va en **UCI** (`e2e4`, `e7e8q`), igual que Stockfish. Es `null` cuando `source == "none"`.
- `source`: `history` (la red entrenada con partidas reales), `openings` (tabla de aperturas) o `none`.
- `difficulty` acepta `Fácil/Medio/Difícil` (con o sin tilde, mayúsculas); si falta se deriva de `elo`
  (<=1250 Fácil, <=1750 Medio, resto Difícil).
- 422 si el FEN es inválido, la partida ya terminó o no hay `difficulty` ni `elo`.

## Cómo decide

Hay **una sola red neuronal** (`app/nn.py`, NumPy puro, sin PyTorch). Recibe el tablero (773 features) y el ELO,
y devuelve una probabilidad para cada una de las 4096 combinaciones origen-destino. Como aprende de partidas
de todos los niveles *sabiendo el ELO de quien jugó*, imita el estilo de cada nivel.

1. Se calcula la distribución con el ELO del request (si es coherente con la dificultad) o el representativo
   del nivel (Fácil 1000, Medio 1500, Difícil 1900).
2. Se descartan las jugadas ilegales y se renormaliza. Las promociones se juegan siempre a dama.
3. Si la red pone menos de `MIN_LEGAL_PROB` (5%) sobre jugadas legales, la posición le es desconocida:
   se usa la tabla de aperturas y, si tampoco hay, `none`.
4. Política por nivel (`app/policies.py`): **Difícil** = la jugada más probable (determinista);
   **Medio** = ruleta entre las 6 mejores; **Fácil** = ruleta aplanada (temperatura 1.4) entre las 10 mejores.
   Los parámetros están en `SAMPLING` y se ajustan en un solo lugar.

## Entrenamiento

**Desde un CSV grande** (`fen,move,elo`, lo genera `training/pgn_a_csv.py`):

```bash
python -m training.pgn_a_csv datasetchess.pgn data/datasetchess.csv 1000000
python -m training.train_csv                                  # usa .env
python -m training.train_csv --max-rows-per-level 200000 --epochs 8 --hidden 512,512
python -m training.train_csv --dry-run                        # solo cuenta y muestrea
```

Lee el CSV en streaming, toma hasta N filas de cada nivel de ELO (queda balanceado), entrena una red y escribe
`models/policy_net.npz` (~5 MiB). Imprime pérdida y acierto top-1/top-3 por época en un 10% de validación
y corta si deja de mejorar.

**Desde la base de datos** (`POST /model/train`): usa solo partidas `FINALIZADA` y solo jugadas de jugadores
`HUMAN` (la IA no aprende de sí misma ni de Stockfish); Difícil solo con jugadas del bando ganador; convierte
SAN -> UCI. Si ya existe una red, **continúa desde ella** (3 épocas con paso chico) en vez de empezar de cero.
Como la BD no guarda el ELO por jugada, cada jugada se etiqueta con el ELO representativo de su nivel.
Registra la versión en `ai_model_versions` y recarga la red en caliente.

### Memoria y tiempo (equipo de 16 GB)

- El dataset ocupa **773 bytes por posición** en memoria: 300 mil filas = ~230 MB, 3 millones = ~2,3 GB.
- La red se entrena por lotes de 512, así que la RAM no depende de cuántas jugadas distintas haya.
  El Random Forest guardaba un vector por jugada en cada hoja y crecía sin control.
- Medido en un entorno de 2 núcleos con 154 mil filas y `--hidden 256,256`: ~17 s por época.
  Con `512,512` el costo es ~2,2 veces mayor. Para acortar: `--hidden 256,256` o menos filas por nivel.

## Resultados con datos sintéticos

Con partidas generadas por una heurística que juega peor a menor ELO (180 mil posiciones, misma partición
para ambos modelos), acierto de la jugada exacta en datos no vistos:

| | Random Forest (3 modelos) | Red (1 modelo) |
|---|---|---|
| top-1 total | 9,3% | 17,0% |
| top-3 total | 17,9% | 30,1% |

Con ELO 1900 la red elige con más decisión (entropía 1,99 vs 2,30 a ELO 1000) y coincide más con la jugada
de la heurística (35% vs 21%): el ELO sí cambia su comportamiento. **Son datos sintéticos**: validan el
pipeline, no estiman el rendimiento sobre partidas reales de Lichess.
