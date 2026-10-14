# Documento de Gestión de la Configuración (GC)

| Campo | Valor |
|---|---|
| Proyecto | Sistema de Ajedrez Local con Motores e IA Basada en Datos (Ajedrez UNViMe) |
| Encargado | Facundo Olivera |
| Versión | 2.0 |
| Última actualización | 13/10/2026 |
| Repositorio | https://github.com/sisajedrez/ajedrez-modelos-simulacion |
| Referencias | SAD v1.2 (15/09/2026) · Especificación de Requisitos (RN-01 a RN-04, CU-01 a CU-06) · 03 Diseño Técnico · 04 Modelado de Datos · 08 Desarrollo Backend (12/10/2026) · 09 Desarrollo Simulación (29/09/2026) · 10 QA (07/10/2026) |

## 0. Cómo usar este documento

Este es un documento de trabajo con valores exactos, no un ejemplo. Un integrante nuevo tiene que poder levantar el proyecto copiando lo que dice acá.

- **El código y este documento tienen que coincidir.** Si difieren, se corrige uno de los dos por Pull Request el mismo día. Los `.env.example` del repo son la copia ejecutable de la sección 3.
- **Columna "Fuente".** *Confirmado* = surge de un documento de otro equipo (se indica cuál). *Propuesta GC* = valor fijado por GC porque no había definición previa; rige hasta que el equipo responsable lo objete (ver sección 13).
- **Hosts.** Entre servicios (backend → IA, backend → PostgreSQL) se usa siempre `127.0.0.1`, nunca `localhost`: Node resuelve `localhost` a `::1` en algunos sistemas y falla contra servicios que escuchan solo en IPv4. En las URLs que abre el navegador se usa `localhost`, porque es el origen que acepta el CORS del backend.
- **Secretos.** No se versionan. En este documento solo figuran credenciales de DEV, TEST y CI, que son descartables. La contraseña de PROD aparece como `<SECRETO>`.
- **Comandos.** Se muestran para bash (Linux, macOS, Git Bash) y para PowerShell (Windows) cuando difieren. En PowerShell se usa `curl.exe`, porque `curl` es un alias de otro comando.

---

## 1. Mapa de entornos

| Entorno | Dónde corre | Para qué sirve | Quién lo usa |
|---|---|---|---|
| **DEV** | PC de cada integrante | Desarrollo diario | Frontend, Backend, Simulación, Datos |
| **TEST** | Contenedor Docker local (`docker-compose.yml`) | Pruebas de integración aisladas | Backend, QA |
| **CI** | GitHub Actions (`ubuntu-latest`) | Verificación automática en cada Pull Request | Todos (bloquea el merge) |
| **PROD** | PC de entrega/demo (instalación final) | Versión entregable, taggeada en `main` | Docente, QA final |

El proyecto no usa servidores remotos ni nube (SAD §1). "Producción" es una instalación completa en una sola PC, con los mismos servicios que DEV, otros usuarios y otra base de datos.

### 1.1 Direcciones y puertos

| Servicio | Escucha en | DEV | TEST | CI | PROD |
|---|---|---|---|---|---|
| Frontend (Vite) | `localhost` | **5173** | — | — | **5173** (build servido con `vite preview`) |
| Backend (Express) | `127.0.0.1` | **3001** | — | — | **3001** |
| Servicio de IA (Python) | `127.0.0.1` | **8000** | — | — | **8000** |
| PostgreSQL | `127.0.0.1` | **5432** | **5433** (Docker, mapea al 5432 interno) | **5432** (contenedor de servicio) | **5432** |
| Stockfish | sin red (stdin/stdout) | — | — | — | — |

**Regla de red:** ningún servicio escucha en `0.0.0.0` ni en una IP de la red local (restricción de ejecución local estricta, SAD §2). Verificación:

```bash
# Linux / macOS
ss -ltn | grep -E ':(3001|8000|5432|5433|5173)\b'
```
```powershell
# Windows
netstat -ano | findstr LISTENING | findstr ":3001 :8000 :5432 :5433 :5173"
```

Las direcciones locales deben ser `127.0.0.1` (o `[::1]` en Vite/PostgreSQL por `localhost`). Si aparece `0.0.0.0` o `[::]`, el servicio está mal configurado: PostgreSQL debe tener `listen_addresses = 'localhost'` (valor por defecto) y el backend `HOST=127.0.0.1`.

---

## 2. Componentes y versiones

| Componente | Versión | Fuente | Notas |
|---|---|---|---|
| Node.js | **24.x LTS** (mínimo aceptado: 22.x) | Propuesta GC | Reemplaza a Node 20, que dejó de recibir parches el 30/04/2026. Node 22 tiene soporte hasta el 30/04/2027; Node 24 hasta el 30/04/2028. Fijado en `.nvmrc`. |
| pnpm | la que indique `packageManager` en `backend/package.json` | Confirmado (08 Backend) | Se activa con `corepack enable`. No se fija número acá para no duplicar la fuente. |
| Express | 5.x | Confirmado (08 Backend) | Reemplaza la referencia a 4.19 de la v1.0 de este documento. |
| pg (node-postgres) | 8.x | Documento GC v1.0 | A confirmar con Backend. |
| chess.js | 1.x (beta) | Documento GC v1.0 | Encapsulado tras la fachada `Tablero`. |
| Frontend | Vite + React, puerto 5173 | Confirmado (08 Backend: "el frontend real es Vite") | El SAD define Next.js 14 en el puerto 3000. Ver D-03. |
| PostgreSQL | **15 o superior**; imagen de test `postgres:15-alpine` | Documento GC v1.0 | Mínimo 15: en 15+ el dueño de la base puede crear objetos en el esquema `public`. |
| Stockfish | **17.1** | Confirmado (08 Backend: probado en Windows) | Binario oficial. Ver sección 5. |
| Python | **3.12** | Propuesta GC | Solo para `ai-service/`. Simulación confirma. |
| Docker | Docker Desktop / Engine con Compose v2 (`docker compose`) | Propuesta GC | Solo para TEST. |

---

## 3. Variables de entorno

### 3.1 Reglas

1. Cada servicio lee su propio `.env` (`backend/.env`, `frontend/.env`, `ai-service/.env`). Los `.env` están en `.gitignore`.
2. Los `.env.example` se versionan y contienen los valores de DEV. No llevan secretos reales.
3. Ninguna ruta, URL ni puerto se escribe fijo en el código: todo sale de variables.
4. Variable nueva = PR que actualiza el `.env.example` **y** esta sección.
5. Variable obligatoria que falta: el backend termina con `process.exit(1)` (principio *fail-fast*, SAD §2). Hoy lo exige `DATABASE_URL`.

### 3.2 Backend (`backend/.env`)

**Variables con el mismo valor en todos los entornos**

| Variable | Valor | Fuente | Descripción |
|---|---|---|---|
| `HOST` | `127.0.0.1` | Propuesta GC | Interfaz en la que escucha Express. |
| `PORT` | `3001` | Confirmado (03 Diseño Técnico y 08 Backend) | Puerto del API. |
| `FRONTEND_URL` | `http://localhost:5173` | Confirmado (08 Backend: CORS para Vite 5173) | Origen exacto permitido por CORS. Abrir la app siempre con esta URL: con `127.0.0.1:5173` el navegador bloquea las llamadas. |
| `STOCKFISH_MOVETIME_MS` | `1000` | Confirmado (GC v1.0; SAD §6.1) | Tiempo de cálculo por jugada (`go movetime`). |
| `STOCKFISH_TIMEOUT_MS` | `3000` | Confirmado (SAD §6.1; 08 Backend) | Límite defensivo; si se supera, se ofrece reintentar o pausar (CU-03, flujo 3a). |
| `STOCKFISH_FALLBACK_SKILL_LEVEL` | `0` | Confirmado (03 Diseño Técnico; 08 Backend) | Nivel de Stockfish que usa la IA propia cuando no tiene datos de la posición (RN-02). |
| `AI_SERVICE_URL` | `http://127.0.0.1:8000` | Confirmado (GC v1.0; SAD) | Servicio de IA. |
| `AI_SERVICE_TIMEOUT_MS` | `5000` | Propuesta GC | El SAD exige timeout pero no fija el valor. Debe ser mayor que `STOCKFISH_TIMEOUT_MS`. |

**Variables que cambian por entorno**

| Variable | DEV | TEST | CI | PROD |
|---|---|---|---|---|
| `NODE_ENV` | `development` | `test` | `test` | `production` |
| `DATABASE_URL` | `postgresql://ajedrez_dev:ajedrez_dev@127.0.0.1:5432/ajedrez_db` | `postgresql://test_user:test_password@127.0.0.1:5433/ajedrez_test` | `postgresql://test_user:test_password@127.0.0.1:5432/ajedrez_test` | `postgresql://ajedrez_app:<SECRETO>@127.0.0.1:5432/ajedrez_prod` |
| `STOCKFISH_PATH` | según sistema operativo (sección 5) | igual que DEV | no requerido (las pruebas no lo necesitan) | según sistema operativo (sección 5) |

`<SECRETO>` se genera con `openssl rand -hex 24` (disponible en Git Bash). Se usa hexadecimal a propósito: los caracteres `+`, `/` y `=` de base64 rompen la URL de conexión.

### 3.3 Frontend (`frontend/.env`)

| Variable | DEV | PROD | Fuente |
|---|---|---|---|
| `VITE_API_URL` | `http://localhost:3001` | `http://localhost:3001` | Propuesta GC |

Vite incorpora la variable al compilar: en PROD hay que definirla **antes** de `build`. Si el frontend pasa a Next.js (D-03), la variable es `NEXT_PUBLIC_API_URL` y el puerto es 3000.

### 3.4 Servicio de IA (`ai-service/.env`)

Nombres propuestos por GC; Simulación los confirma o corrige (sección 13).

| Variable | DEV | PROD | Descripción |
|---|---|---|---|
| `HOST` | `127.0.0.1` | `127.0.0.1` | Interfaz de escucha. |
| `PORT` | `8000` | `8000` | Puerto (Diseño Técnico: servicio IA en 8000). |
| `DATABASE_URL` | igual que el backend DEV | igual que el backend PROD | La IA lee solo partidas `FINALIZADA` (RN-01). |
| `MODEL_DIR` | `./models` | `./models` | Carpeta de modelos entrenados (se registra en `ai_model_versions.file_path`). |
| `LICHESS_PGN_PATH` | `./data/lichess_sample.pgn` | `./data/lichess_sample.pgn` | PGN de Lichess para `POST /dataset/seed` (RN-04). No se versiona. |

### 3.5 Aprovisionamiento (`.env.example` de la raíz)

Parámetros que se pasan a `psql` para `db/init.sql`. No los lee ninguna aplicación: `PGHOST=127.0.0.1`, `PGPORT=5432`, `PGUSER=postgres`, `APP_DB_ROLE`, `APP_DB_PASSWORD`, `APP_DB_NAME`.

### 3.6 Manejo de secretos

- Nunca se hace commit de un `.env`, un dump de base de datos ni una contraseña real. El pipeline de CI no usa secretos de GitHub: sus credenciales son las del contenedor efímero.
- **Acción inmediata para Backend:** la guía de despliegue (08 Backend) tiene una contraseña escrita en texto plano. Hay que sacarla del documento. Si corresponde a una base real (Supabase), hay que rotarla antes de subir ese documento al repo.
- La contraseña de PROD vive solo en el `.env` de la PC de entrega y en el gestor de contraseñas del equipo.

---

## 4. Base de datos

### 4.1 Servidores, bases y usuarios

| Entorno | Host | Puerto | Base | Usuario | Contraseña | Privilegios |
|---|---|---|---|---|---|---|
| DEV | `127.0.0.1` | 5432 | `ajedrez_db` | `ajedrez_dev` | `ajedrez_dev` (solo DEV) | Dueño de la base, sin superusuario |
| TEST | `127.0.0.1` | 5433 | `ajedrez_test` | `test_user` | `test_password` | Superusuario del contenedor (descartable) |
| CI | `127.0.0.1` | 5432 | `ajedrez_test` | `test_user` | `test_password` | Superusuario del contenedor efímero |
| PROD | `127.0.0.1` | 5432 | `ajedrez_prod` | `ajedrez_app` | `<SECRETO>` | Dueño de la base, sin superusuario |
| Administración | `127.0.0.1` | 5432 | — | `postgres` | la elegida al instalar PostgreSQL | Solo para ejecutar `db/init.sql`; la aplicación nunca lo usa |

Usuarios, nombres de base y contraseñas de DEV y PROD: Propuesta GC (la v1.0 usaba `postgres:postgres` para todo). TEST y CI: Confirmado (GC v1.0).

### 4.2 Aprovisionamiento (una vez por entorno)

`db/init.sql` crea el rol y la base si no existen (se puede ejecutar más de una vez).

```bash
# DEV
psql -h 127.0.0.1 -U postgres -v app_role=ajedrez_dev -v app_password=ajedrez_dev -v app_db=ajedrez_db -f db/init.sql
psql -h 127.0.0.1 -U ajedrez_dev -d ajedrez_db -f db/schema.sql
psql -h 127.0.0.1 -U ajedrez_dev -d ajedrez_db -f db/seeds/01_difficulty_profiles.sql
```

```bash
# PROD (reemplazar <SECRETO> por el valor generado con: openssl rand -hex 24)
psql -h 127.0.0.1 -U postgres -v app_role=ajedrez_app -v app_password=<SECRETO> -v app_db=ajedrez_prod -f db/init.sql
psql -h 127.0.0.1 -U ajedrez_app -d ajedrez_prod -f db/schema.sql
psql -h 127.0.0.1 -U ajedrez_app -d ajedrez_prod -f db/seeds/01_difficulty_profiles.sql
```

Los comandos son iguales en PowerShell. En Windows, `psql` está en `C:\Program Files\PostgreSQL\<versión>\bin`; si el comando no se reconoce, agregar esa carpeta al `PATH`.

### 4.3 Esquema

`db/schema.sql` es el modelo físico entregado por Modelado de Datos (04), sin cambios. Es la **fuente única del esquema** (D-11).

| Tabla | Función | Notas |
|---|---|---|
| `difficulty_profiles` | Catálogo de dificultad: `name`, `skill_level`, `search_depth`, `time_limit_ms` | Una fila por nivel. |
| `games` | Una fila por partida: jugadores, modo, `status`, `result`, `current_fen`, `source` | `source` distingue partidas de usuarios (`USER`) de las del dataset inicial (`SEED`). |
| `moves` | Una fila por jugada: `san`, `fen_before`, `fen_after`, `eval_score` | `game_id` con `ON DELETE CASCADE`. |
| `ai_model_versions` | Registro de modelos entrenados | Tabla independiente, sin relaciones. |

| Tipo ENUM | Valores |
|---|---|
| `game_mode` | `LOCAL`, `STOCKFISH`, `AI` |
| `player_type` | `HUMAN`, `ENGINE`, `AI` |
| `game_status` | `EN_PROGRESO`, `PENDIENTE`, `FINALIZADA` |
| `game_source` | `USER`, `SEED` |
| `piece_color` | `WHITE`, `BLACK` |

Índices: `idx_moves_fen_before` sobre `moves(fen_before)` e `idx_games_status` sobre `games(status)`.

### 4.4 Convención de nomenclatura

Reemplaza la de la v1.0 (que hablaba de `partidas` y `jugadas`) para quedar alineada con el modelo vigente de Modelado de Datos.

| Elemento | Convención | Ejemplo |
|---|---|---|
| Tablas | `snake_case`, plural, en inglés | `games`, `moves` |
| Columnas | `snake_case`, en inglés | `started_at`, `fen_before` |
| Clave primaria | siempre `id`, tipo UUID con `gen_random_uuid()` | `id` |
| Claves foráneas | `<entidad_singular>_id` | `game_id`, `difficulty_profile_id` |
| Tipos ENUM | `snake_case`, singular | `game_status` |
| Valores de ENUM | `MAYUSCULAS_CON_GUION_BAJO` | `EN_PROGRESO`, `FINALIZADA` |
| Índices | `idx_<tabla>_<columna>` | `idx_games_status` |
| Marcas de tiempo | sufijo `_at` | `started_at`, `ended_at` |

### 4.5 Regla de integridad (RN-01)

El entrenamiento y la consulta de la IA propia solo usan partidas terminadas formalmente. Las partidas `EN_PROGRESO` y `PENDIENTE` se guardan para auditoría y para poder reanudarlas, pero no entran al aprendizaje.

```sql
SELECT m.fen_before, m.san, g.result
FROM moves m
JOIN games g ON g.id = m.game_id
WHERE g.status = 'FINALIZADA';
```

Toda consulta de la IA o del entrenamiento sobre `moves` lleva este filtro. En la revisión del SAD se detectó que la construcción del dataset de entrenamiento filtra por `source` pero no por estado (D-08); Simulación y Backend deben corregirlo.

### 4.6 Datos iniciales (seeds)

| Archivo | Contenido | Estado |
|---|---|---|
| `db/seeds/01_difficulty_profiles.sql` | Perfiles `FACIL` (Skill Level 3), `MEDIO` (10), `DIFICIL` (20), con `time_limit_ms = 1000` | Listo. Se puede ejecutar más de una vez. Borrador hasta que Modelado defina columnas de ELO (D-09). |
| Dataset de partidas (RN-04) | Partidas de Lichess convertidas a pares FEN → jugada, con `source = 'SEED'` | Pendiente. La carga debe ser atómica (una transacción) e idempotente (si ya hay filas `SEED`, no vuelve a cargar). Falta decidir quién la ejecuta (D-12). |

### 4.7 Respaldo y restauración (PROD)

```bash
pg_dump -h 127.0.0.1 -U ajedrez_app -Fc ajedrez_prod -f backup_ajedrez_prod_AAAA-MM-DD.dump
pg_restore -h 127.0.0.1 -U ajedrez_app -d ajedrez_prod --clean --if-exists backup_ajedrez_prod_AAAA-MM-DD.dump
```

Los `.dump` no se versionan (están en `.gitattributes` como binarios) ni se suben al repo.

---

## 5. Stockfish

El backend lo ejecuta como proceso hijo (`child_process.spawn`) y se comunica por stdin/stdout con el protocolo UCI. No hay conexión de red (SAD §6.1). El binario **no se sube al repo** (`backend/bin/*` está en `.gitignore`).

| Sistema | Instalación | `STOCKFISH_PATH` |
|---|---|---|
| Windows | Descargar el binario oficial desde stockfishchess.org y copiarlo como `backend\bin\stockfish.exe` | `./bin/stockfish.exe` (relativa a `backend/`; arrancar el backend desde esa carpeta) |
| macOS (Apple Silicon) | `brew install stockfish` | `/opt/homebrew/bin/stockfish` |
| macOS (Intel) | `brew install stockfish` | `/usr/local/bin/stockfish` |
| Linux (Debian/Ubuntu) | `sudo apt-get install stockfish` | `/usr/games/stockfish` |

**Verificación** (debe responder `uciok`):

```bash
printf 'uci\nquit\n' | ./backend/bin/stockfish        # Linux/macOS: usar la ruta de la tabla
```
```powershell
"uci","quit" | .\backend\bin\stockfish.exe              # Windows
```

**Parámetros UCI** (SAD §6.1; 08 Backend)

| Parámetro | Valor |
|---|---|
| Secuencia por jugada | `uci` → `setoption name Skill Level value X` → `position fen <FEN>` → `go movetime 1000` → leer `bestmove` |
| Skill Level Fácil / Medio / Difícil | **3 / 10 / 20** (se leen de `difficulty_profiles.skill_level`) |
| Tiempo de cálculo | `STOCKFISH_MOVETIME_MS = 1000` |
| Timeout defensivo | `STOCKFISH_TIMEOUT_MS = 3000`, con reintento |
| Respaldo de la IA propia | Skill Level `0` (`STOCKFISH_FALLBACK_SKILL_LEVEL`) |

La versión 17.1 es la probada por Backend en Windows. Quien use otra versión debe avisar al correr las pruebas de integración con el motor real.

---

## 6. Puesta en marcha local (DEV)

### 6.1 Requisitos previos

Git, Node.js 24 (con `nvm`, `nvm-windows` o `fnm`; el repo trae `.nvmrc`), pnpm vía `corepack enable`, PostgreSQL 15+, Python 3.12, Docker (solo para TEST) y Stockfish (sección 5).

### 6.2 Pasos

1. **Clonar y crear la rama de trabajo** desde `develop`:
   ```bash
   git clone https://github.com/sisajedrez/ajedrez-modelos-simulacion.git
   cd ajedrez-modelos-simulacion
   git checkout -b feature/nombre-tarea develop
   ```
2. **Crear los `.env`** a partir de los ejemplos:
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   cp ai-service/.env.example ai-service/.env
   ```
   ```powershell
   Copy-Item backend\.env.example backend\.env
   Copy-Item frontend\.env.example frontend\.env
   Copy-Item ai-service\.env.example ai-service\.env
   ```
   Editar `STOCKFISH_PATH` en `backend/.env` según la sección 5.
3. **Crear la base de datos:** comandos DEV de la sección 4.2.
4. **Instalar dependencias:**
   ```bash
   corepack enable
   pnpm --dir backend install
   pnpm --dir frontend install
   python -m venv ai-service/.venv
   source ai-service/.venv/bin/activate        # Windows: .\ai-service\.venv\Scripts\Activate.ps1
   pip install -r ai-service/requirements.txt
   ```
   El gestor del frontend no está confirmado; se asume pnpm por consistencia (sección 13).
5. **Arrancar los servicios** en este orden, cada uno en su terminal:

   | Orden | Servicio | Comando |
   |---|---|---|
   | 1 | PostgreSQL | servicio del sistema (ya activo) |
   | 2 | Servicio de IA | el comando lo fija Simulación en `ai-service/README.md` |
   | 3 | Backend | `pnpm --dir backend dev` |
   | 4 | Frontend | `pnpm --dir frontend dev` |

   El backend funciona sin el servicio de IA para los modos Local y Stockfish; el modo IA propia lo necesita.

### 6.3 Verificación

| Qué | Comando | Resultado esperado |
|---|---|---|
| Base | `psql -h 127.0.0.1 -U ajedrez_dev -d ajedrez_db -c "SELECT count(*) FROM difficulty_profiles;"` | `3` |
| Backend | `curl.exe http://127.0.0.1:3001/health` | HTTP 200 con el estado del servidor y la base |
| Perfiles | `curl.exe http://127.0.0.1:3001/difficulty-profiles` | Lista Fácil / Medio / Difícil |
| Servicio de IA | `curl.exe http://127.0.0.1:8000/health` | HTTP 200 |
| Frontend | abrir `http://localhost:5173` | Se ve el menú principal |

### 6.4 Pruebas

```bash
pnpm --dir backend test               # 80 pruebas unitarias y de API (08 Backend)
pnpm --dir backend test:integration   # requiere PostgreSQL de TEST (sección 7)
```

---

## 7. Entorno compartido de pruebas (TEST) y CI

### 7.1 TEST con Docker Compose

`docker-compose.yml` levanta un PostgreSQL 15 descartable en `127.0.0.1:5433`. Los datos viven en memoria (`tmpfs`): al apagarlo no queda nada. El puerto se publica solo en loopback.

```bash
docker compose up -d --wait
DATABASE_URL=postgresql://test_user:test_password@127.0.0.1:5433/ajedrez_test pnpm --dir backend test:integration
docker compose down -v
```
```powershell
docker compose up -d --wait
$env:DATABASE_URL="postgresql://test_user:test_password@127.0.0.1:5433/ajedrez_test"; pnpm --dir backend test:integration
Remove-Item Env:DATABASE_URL; docker compose down -v
```

Las pruebas de integración del backend aplican su propia migración (08 Backend). Cuando se resuelva D-11, la migración pasa a usar `db/schema.sql`.

**Quién lo corre:** cada desarrollador puede correrlo localmente (recomendado antes de abrir un PR) y el CI lo corre siempre. Es la resolución propuesta a la duda abierta en la v1.0 (sección 13).

### 7.2 CI (GitHub Actions)

Archivo: `.github/workflows/ci.yml`, workflow `CI Tests`, job `backend-tests`.

| Dato | Valor |
|---|---|
| Disparador | Pull Request hacia `develop` o `main` |
| Máquina | `ubuntu-latest` |
| Node.js | versión de `.nvmrc` (24) |
| pnpm | versión de `packageManager` en `backend/package.json` |
| PostgreSQL | contenedor de servicio `postgres:15-alpine` en `127.0.0.1:5432`, base `ajedrez_test`, usuario `test_user`, contraseña `test_password` |
| Pasos | instalar con `--frozen-lockfile` → `pnpm --dir backend test` → `pnpm --dir backend test:integration` |
| Secretos de GitHub | ninguno |

Mientras `backend/package.json` no exista, los pasos de Node se omiten y el job termina en verde. Falta agregar un job para las pruebas del frontend cuando se confirme su gestor de paquetes.

---

## 8. Producción / entrega

### 8.1 Alcance

Instalación completa en una sola PC, a partir de un tag de `main`. Mismos servicios y puertos que DEV, con:

- usuario de base de datos propio sin privilegios de superusuario (`ajedrez_app`) y contraseña generada;
- base `ajedrez_prod`, separada de la de desarrollo;
- `NODE_ENV=production` y frontend compilado, no en modo desarrollo;
- ningún puerto expuesto fuera de `127.0.0.1`.

### 8.2 Valores

| Dato | Valor |
|---|---|
| Host de todos los servicios | `127.0.0.1` |
| Backend | `http://127.0.0.1:3001` |
| Frontend (abrir en el navegador) | `http://localhost:5173` |
| Servicio de IA | `http://127.0.0.1:8000` |
| PostgreSQL | `127.0.0.1:5432`, base `ajedrez_prod`, usuario `ajedrez_app` |
| Variables | las de la sección 3, columna PROD |

### 8.3 Procedimiento de instalación

1. Instalar los requisitos de la sección 6.1 (sin Docker).
2. Obtener la versión: `git clone <repo>` y `git checkout v<versión>` (tag de `main`, sección 9.6).
3. Generar la contraseña: `openssl rand -hex 24`. Guardarla en el gestor de contraseñas del equipo.
4. Crear `backend/.env`, `frontend/.env` y `ai-service/.env` con los valores PROD de la sección 3.
5. Aprovisionar la base: comandos PROD de la sección 4.2.
6. Instalar dependencias de producción y compilar el frontend:
   ```bash
   pnpm --dir backend install --frozen-lockfile --prod
   pnpm --dir frontend install --frozen-lockfile
   pnpm --dir frontend build
   ```
7. Cargar el dataset inicial (RN-04) según lo que se decida en D-12.
8. Arrancar en este orden: servicio de IA → backend (`pnpm --dir backend start`) → frontend (`pnpm --dir frontend exec vite preview --port 5173 --strictPort`).

### 8.4 Verificación posterior a la instalación

| Prueba | Comando | Resultado esperado |
|---|---|---|
| Salud del backend | `curl.exe http://127.0.0.1:3001/health` | HTTP 200 |
| Salud de la IA | `curl.exe http://127.0.0.1:8000/health` | HTTP 200 |
| Dataset cargado (RN-04) | `psql -h 127.0.0.1 -U ajedrez_app -d ajedrez_prod -c "SELECT count(*) FROM games WHERE source = 'SEED';"` | mayor que 0 |
| Puertos cerrados al exterior | comando de la sección 1.1 | solo `127.0.0.1` / `[::1]` |
| Partida de punta a punta | crear partida vs. Stockfish, jugar, pausar, reanudar, exportar PGN | sin errores |

### 8.5 Reversión

Detener los servicios, `git checkout` del tag anterior, repetir los pasos 6 y 8. Si el esquema cambió entre versiones, restaurar antes el respaldo de la sección 4.7.

---

## 9. Control de versiones

### 9.1 Ramas

| Rama | Uso |
|---|---|
| `main` | Código entregable. Solo recibe merges desde `develop` al cerrar una fase. |
| `develop` | Integración de funcionalidades listas para probar en conjunto. |
| `feature/<nombre-corto>` | Una funcionalidad (ej. `feature/uci-stockfish`, `feature/repository-moves`). |
| `fix/<nombre-corto>` | Una corrección puntual (ej. `fix/timeout-stockfish`, `fix/fen-normalization`). |
| `docs/<nombre-corto>` | Cambios solo de documentación (ej. `docs/actualizar-gc`). |

Nombres en minúsculas, con guiones. Una rama = una funcionalidad o una corrección. La rama `feature/backend-fase1` (Backend) está pendiente de subir y de abrir su PR.

### 9.2 Reglas de contribución

- Prohibido el commit directo sobre `main` y `develop`.
- Todo cambio entra por Pull Request aprobado por el Tech Lead.
- Las ramas de trabajo salen de `develop` y vuelven a `develop`.

### 9.3 Mensajes de commit

Formato `tipo(alcance): descripción en presente`, con el alcance opcional.

| Tipo | Uso |
|---|---|
| `feat` | Funcionalidad nueva |
| `fix` | Corrección de un fallo |
| `docs` | Documentación |
| `test` | Pruebas |
| `refactor` | Cambio interno sin cambio de comportamiento |

Alcances usados: `frontend`, `backend`, `ai`, `db`, `docs`, `ci`. Ejemplo: `feat(backend): agrega endpoint de abandono`.

### 9.4 Pull Requests

1. Abrir el PR hacia `develop` con la plantilla de `.github/pull_request_template.md`.
2. Indicar el caso de uso o regla de negocio que cubre (trazabilidad).
3. El CI tiene que estar en verde.
4. Lo aprueba el Tech Lead. Se hace *squash merge* hacia `develop` y *merge commit* de `develop` hacia `main`.
5. Se borra la rama de trabajo después del merge.

### 9.5 Protección de ramas

Configuración a aplicar en GitHub (Settings → Branches) sobre `main` y `develop`:

- exigir Pull Request antes de mergear, con 1 aprobación;
- descartar aprobaciones cuando entran commits nuevos;
- exigir que pase el chequeo `backend-tests`;
- prohibir *force push* y borrado de la rama.

Depende de la decisión de visibilidad del repositorio (sección 13): en repos privados estas reglas requieren un plan de GitHub que las incluya (GitHub Pro vía Student Developer Pack).

### 9.6 Versiones y entregas

Al cerrar cada fase se mergea `develop` en `main` y se crea un tag anotado:

| Tag | Contenido |
|---|---|
| `v0.1.0` | Fase 1: motor de reglas y juego local |
| `v0.2.0` | Fase 2: integración de Stockfish |
| `v0.3.0` | Fase 3: IA propia basada en datos |
| `v1.0.0` | Fase 4: historial, reanudación y reproducción PGN (entrega final) |

Las correcciones posteriores a un tag suben el tercer número (`v0.1.1`).

### 9.7 Cambios sobre interfaces fijadas

Los nombres de clases, métodos y endpoints definidos en Diseño Técnico no se cambian sin avisar al equipo. Un cambio de ese tipo requiere: PR con la etiqueta `cambio-de-interfaz`, aviso en el canal del equipo, y actualización de `docs/diseno-tecnico.md` en el mismo PR.

---

## 10. Estructura del repositorio

```
proyecto-ajedrez/
├── frontend/                  # Interfaz (hoy Vite + React; ver D-03)
│   ├── components/
│   │   ├── Tablero/
│   │   └── SelectorModo/
│   ├── pages/
│   └── tests/                 # pruebas unitarias frontend
├── backend/                   # Express
│   ├── bin/                   # binario de Stockfish (no versionado)
│   ├── src/
│   │   ├── controllers/       # rutas: crear partida, enviar jugada, historial
│   │   ├── engines/           # MotorStockfish, MotorIAPropia
│   │   ├── validators/        # ValidadorDeJugada
│   │   ├── models/            # Partida, Jugada, Jugador, ConfiguracionDeDificultad
│   │   ├── repositories/      # patrón Repository (acceso a PostgreSQL)
│   │   └── routes/
│   └── tests/                 # pruebas unitarias backend
├── ai-service/                # servicio Python de IA propia
│   ├── models/                # modelos entrenados (no versionado)
│   ├── data/                  # datasets descargados (no versionado)
│   └── tests/
├── db/
│   ├── schema.sql             # modelo físico de Modelado de Datos
│   ├── init.sql               # rol y base por entorno
│   └── seeds/
├── docs/
│   ├── analisis-requisitos.md
│   ├── arquitectura.md
│   ├── diseno-tecnico.md
│   ├── documento-GC.md
│   └── informe-QA.md
├── tests-integracion/         # pruebas de integración (QA)
├── .github/
│   ├── workflows/ci.yml
│   ├── pull_request_template.md
│   └── CODEOWNERS
├── docker-compose.yml         # entorno compartido de pruebas
├── .env.example               # variables de aprovisionamiento
├── .gitignore · .gitattributes · .editorconfig · .nvmrc
└── README.md
```

Respecto de la v1.0 se agregaron `backend/src/repositories/` (patrón Repository del SAD §5.3), `ai-service/` (el servicio Python de Simulación no tenía lugar en el repo), `db/init.sql`, `.github/` y los archivos de configuración de la raíz.

### 10.1 Responsables por carpeta

| Carpeta / archivo | Responsables |
|---|---|
| `frontend/` | Frontend *(a completar)*; especificaciones visuales: Perla Quispe (Diseño Gráfico & UX) |
| `backend/` | Marcos Teixido, German Velazquez, Axel Nievas |
| `backend/src/engines/` | Backend y Simulación (quién mantiene `MotorStockfish` está sin definir; sección 13) |
| `ai-service/` | Paula Chicher, Lazaro Sanchez, Luciano Sigot |
| `db/` | Mateo Vanden, Valentín Faba, Máximo Vinuesa |
| `docs/arquitectura.md` | Thomas Cardarelli |
| `docs/diseno-tecnico.md` | Nacho Gaynor, Gonzalo Rozandal |
| `docs/analisis-requisitos.md` | Análisis y Requisitos *(a completar)* |
| `docs/informe-QA.md`, `tests-integracion/` | Agustín Lucero, Franco Calizaya |
| `docs/documento-GC.md`, `.github/`, `docker-compose.yml`, archivos de raíz | Facundo Olivera |
| Aprobación de PR | Tech Lead *(nombre a completar)* |

---

## 11. Control de la documentación

- Cada documento de `docs/` lleva un encabezado con responsable, versión y fecha de última actualización.
- Los documentos se actualizan por PR (`docs/<nombre-corto>`), igual que el código.
- Esta versión de la GC reemplaza a la v1.0 (16/09/2026).

---

## 12. Discrepancias detectadas entre documentos

Al cruzar los documentos de todos los equipos aparecieron las diferencias de abajo. La columna "Decisión GC" es la que usan los archivos del repo hasta que el responsable la confirme o la cambie.

| ID | Tema | Qué dicen los documentos | Decisión GC | Confirma |
|---|---|---|---|---|
| D-01 | Puerto del backend | SAD y GC v1.0: 4000. Diseño Técnico y Backend: 3001 | **3001** (es el que está implementado) | Arquitectura |
| D-02 | Prefijo de rutas | SAD: `/api/games`, `/api/history`. Diseño Técnico y Backend: `/games`, sin prefijo | **Sin prefijo**, siguiendo Diseño Técnico | Arquitectura |
| D-03 | Frontend | SAD: Next.js 14 en el puerto 3000. Backend: el frontend real es Vite en el 5173 | **Vite, 5173**; la estructura de carpetas se mantiene | Arquitectura, Frontend |
| D-04 | Gestor de paquetes y Express | GC v1.0: npm y Express 4.19. Backend: pnpm y Express 5 | **pnpm y Express 5** | Backend |
| D-05 | Versión de Node | GC v1.0: Node 20 LTS | **Node 24 LTS**: Node 20 está fuera de soporte desde el 30/04/2026 | Backend, Arquitectura |
| D-06 | Nombres en la base | SAD y GC v1.0: `partidas`, `jugadas`. Modelado: `games`, `moves` | **Los de Modelado** (sección 4.4) | Modelado |
| D-07 | Estado de partidas interrumpidas | SAD: `INTERRUMPIDA`. Requisitos y Modelado: `PENDIENTE` (pendiente/pausada) | **`PENDIENTE`** | Arquitectura |
| D-08 | Filtro del dataset de entrenamiento | El SAD exige solo partidas `FINALIZADA`, pero su nota de revisión indica que la consulta actual filtra por `source` y no por estado | **El filtro es obligatorio** (sección 4.5) | Simulación, Backend |
| D-09 | Dificultad y ELO | Requisitos: Fácil 800–1200, Medio 1300–1700, Difícil 1800+. UX: rangos de 100–300 y 200–400. Modelado: `difficulty_profiles` sin columnas de ELO. Backend dice que su tabla tiene nivel y ELO. Consulta al docente pendiente | El seed carga solo `skill_level`; no se inventan rangos de ELO | Docente, Modelado, Requisitos |
| D-10 | Respaldo de la IA propia | RN-02: tabla de aperturas o Stockfish de baja profundidad. SAD §6.2: jugadas legales por material o azar. Diseño Técnico y Backend: Stockfish Skill Level mínimo | **Stockfish Skill Level 0 desde el backend** (`STOCKFISH_FALLBACK_SKILL_LEVEL`); el servicio Python no usa Stockfish | Arquitectura, Diseño Técnico |
| D-11 | Fuente del esquema | `db/schema.sql` (Modelado) y la migración propia de Backend | **`db/schema.sql` es la fuente única**; Backend adapta su migración | Backend, Modelado |
| D-12 | Quién carga el dataset inicial | GC v1.0: `npm run seed` en el backend. Diseño Técnico: `POST /dataset/seed` en el servicio de IA | Sin decidir | Backend, Simulación |
| D-13 | Índice sobre FEN | La IA consulta por FEN simplificado (4 campos, SAD §6.2) pero `idx_moves_fen_before` indexa el FEN completo (6 campos): una búsqueda por el FEN de 4 campos no lo aprovecha | Proponer a Modelado una columna o índice sobre el FEN simplificado | Modelado, Simulación |
| D-14 | "Ejecución local estricta" | SAD §2 la declara, pero también describe servicios separados con `AI_SERVICE_URL` y CORS | Se mantiene la regla con otra redacción: **todo escucha solo en `127.0.0.1`** (sección 1.1) | Arquitectura |

También se corrigió en los archivos de entorno: `docker-compose.yml` publicaba el puerto de test como `5433:5432` (queda abierto en todas las interfaces) y ahora es `127.0.0.1:5433:5432`; se quitó la clave `version` (obsoleta en Compose v2) y se agregó un chequeo de salud.

---

## 13. Pendientes y decisiones abiertas

| # | Pendiente | Responsable | Resolución propuesta por GC |
|---|---|---|---|
| 1 | Confirmar Node 24, y que los nombres de variables de la sección 3 coincidan con el código | Backend | Si difieren, corregir el `.env.example` por PR |
| 2 | Visibilidad del repo (público o privado) y activar la protección de ramas de la sección 9.5 | GC, Tech Lead, docente | Privado con GitHub Pro (Student Developer Pack) si el código no debe quedar expuesto |
| 3 | Nombre y usuario de GitHub del Tech Lead y de cada integrante, para activar `CODEOWNERS` | Cada equipo | — |
| 4 | Base local o Supabase | Backend, GC | **PostgreSQL local**: el SAD §1 pide que el sistema funcione sin nube ni internet |
| 5 | Rotar o sacar la contraseña escrita en la guía de despliegue de Backend (sección 3.6) | Backend | Antes de subir ese documento al repo |
| 6 | Comando de arranque, framework y `requirements.txt` del servicio de IA; confirmar nombres de variables (sección 3.4) | Simulación | Documentarlo en `ai-service/README.md` |
| 7 | Quién mantiene el adaptador de Stockfish | Backend, Simulación | Backend lo mantiene hasta que Simulación entregue `MotorStockfish` |
| 8 | Gestor de paquetes del frontend y documento de Frontend (07), que GC no recibió | Frontend | pnpm, por consistencia con Backend |
| 9 | Importar PGN: falta el caso de uso (Requisitos) y el endpoint (Diseño Técnico), aunque QA ya tiene casos PF-IMP-01 y PF-IMP-02 | Requisitos, Diseño Técnico | — |
| 10 | El prototipo de reporte de QA usa Frontend `:3000` y Backend `:4000` | QA | Actualizarlo a 5173 y 3001 (sección 1.1). El defecto de ejemplo cita un timeout de 8 s; el configurado es 3 s |
| 11 | El reloj de partida (15:00, 10/15/20 min en UX) no figura en ningún requisito | Requisitos, UX | Derivar |

Pendientes de la v1.0 que quedaron resueltos: versión de Node y PostgreSQL (sección 2), entorno Docker de test (sección 7.1) y `.env.example` tras el cierre del modelo físico (Modelado entregó `db/schema.sql`).

---

## 14. Historial de cambios

| Versión | Fecha | Cambios |
|---|---|---|
| 1.0 | 16/09/2026 | Documento inicial: ramas, estructura, entorno local, Docker Compose, onboarding. |
| 2.0 | 13/10/2026 | Reescritura completa: mapa de entornos con IPs, puertos, usuarios y variables exactas para DEV, TEST, CI y PROD; alineación con Backend (3001, pnpm, Express 5), Modelado (`games`, `moves`) y Diseño Técnico; Node 24 por fin de soporte de Node 20; `docker-compose.yml` limitado a loopback; `ai-service/`, `db/init.sql`, seeds, CI y plantillas de PR; registro de discrepancias entre documentos. |
