# Integration and stress tests

Both suites run against the throwaway TEST database from `docker-compose.yml` (GC §7.1):
`postgres:15-alpine` on `127.0.0.1:5433`, db `ajedrez_test`, user `test_user`, data in tmpfs.

Safety: `tests/db/helpers.js` refuses to run unless the database name ends with `_test`, because
every file starts with `DROP SCHEMA public CASCADE` and re-applies `db/schema.sql` + the difficulty seed.

## Run

Bash (repo root, then `backend/`):

```bash
docker compose up -d --wait
export DATABASE_URL=postgresql://test_user:test_password@127.0.0.1:5433/ajedrez_test
pnpm --dir backend test:integration     # ~5 s
pnpm --dir backend test:stress          # ~4-5 min with defaults
docker compose down -v
```

PowerShell:

```powershell
docker compose up -d --wait
$env:DATABASE_URL = "postgresql://test_user:test_password@127.0.0.1:5433/ajedrez_test"
pnpm --dir backend test:integration
pnpm --dir backend test:stress
docker compose down -v
```

`pnpm test` (unit + api) does not need a database and does not pick up `tests/db` or `tests/stress`.
Run one scenario: `node --test tests/stress/many-games.test.js` (with `DATABASE_URL` set).

Sizes (defaults in brackets); `STRESS_SCALE` multiplies all counts (e.g. `STRESS_SCALE=0.2` for a smoke run):

| Variable | Default | Meaning |
| --- | --- | --- |
| `STRESS_SCALE` | 1 | Global multiplier |
| `STRESS_LONG_GAMES` | 3 | Games above 100 full moves |
| `STRESS_LONG_MAX_PLIES` | 240 | Plies per long game |
| `STRESS_SF_ENGINE_MOVES` | 15 | Engine moves per Stockfish game |
| `STRESS_MANY_GAMES` | 300 | Saved/resumed games |
| `STRESS_CONCURRENCY` / `STRESS_SF_CONCURRENCY` | 20 / 2 | In-flight LOCAL / engine games |
| `STRESS_SEED_GAMES` / `STRESS_USER_GAMES` | 1000 / 200 | Dataset size |

Each scenario prints a `[stress]` summary (counts, total time, p50/p95/max latency).

## Scenarios

- `tests/db/repositories.test.js` (integration): the real SQL of every repository method, `list` filters /
  counts / pagination, D-08 training filter, `withTransaction` rollback, and the API happy path over the
  real DB (play to mate, illegal move persists nothing, PGN import valid / pending / invalid, restart + resume).
- `long-games.test.js`: seeded random games through the API until 240 plies; at least 3 exceed 100 full
  moves. Checks every ply persisted with correct `move_number` / colour, `current_fen` equals the last
  `fen_after`, `GET /games/:id` order, and PGN export -> import gives the same SAN list.
- `stockfish-max.test.js`: DIFICIL (skill 20), real `bin/stockfish.exe`, movetime 1000 / timeout 3000.
  One full game per human colour (15 engine moves each, other seeds are tried if the random human is
  mated early). Checks zero `ENGINE_TIMEOUT`, legal and persisted engine moves, warm latency < 3000 ms
  (cold start has its own 13 s budget) and no `stockfish.exe` left (`tasklist`). Skipped without the binary.
- `many-games.test.js`: 300 games (10 vs Stockfish FACIL) played 4-10 plies with concurrency 20, paused,
  restart simulated (new registry/services over the same DB), orphaned `EN_PROGRESO` games recovered to
  `PENDIENTE`, everything resumed with FEN/turn verified and one more legal move played. Also 20 concurrent
  moves on the same game: exactly one accepted per round, no duplicated rows, consistent final FEN.
- `dataset.test.js`: 1,000 SEED + 200 USER games (all statuses). `findTrainingMoves()` returns exactly the
  moves of FINALIZADA games (matches an independent SQL count and the generated data), history `list`
  filters / pagination match SQL, and a second seed run inserts nothing.

Note: cold-starting several Stockfish processes at once is slow on Windows (5 concurrent spawns took ~10 s,
which exceeds the 10 s startup timeout), so engine games use `STRESS_SF_CONCURRENCY` (default 2).
