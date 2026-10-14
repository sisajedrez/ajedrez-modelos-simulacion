# ai-service — IA propia basada en datos

Servicio Python de **Desarrollo Simulación** (Paula Chicher, Lazaro Sanchez, Luciano Sigot).
Corre en `http://127.0.0.1:8000` y lo consume el backend vía `AI_SERVICE_URL`.

## Contrato (Diseño Técnico)

| Método | Ruta | Uso |
|---|---|---|
| GET | `/health` | Verificación |
| POST | `/predict-move` | `{ fen, difficulty, elo }` → `{ move, source: "history" \| "openings" \| "none" }` |
| POST | `/dataset/seed` | Cargar dataset inicial (RN-04) |
| POST | `/model/train` | Reentrenar con partidas `FINALIZADA` (RN-01) |

Cuando `source` es `none`, el backend resuelve la jugada con Stockfish en Skill Level 0
(`STOCKFISH_FALLBACK_SKILL_LEVEL`): este servicio no necesita Stockfish.

## Pendiente de Simulación

- Elegir framework y fijar el **comando de arranque** exacto (completar aquí y en `docs/documento-GC.md` §6).
- Completar `requirements.txt` con las versiones fijadas.
- Confirmar los nombres de variables de `.env.example` (propuestos por GC).

## Entorno

Python 3.12 con entorno virtual local:

```bash
python -m venv ai-service/.venv
source ai-service/.venv/bin/activate      # Windows PowerShell: .\ai-service\.venv\Scripts\Activate.ps1
pip install -r ai-service/requirements.txt
```
