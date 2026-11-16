// Shared helpers for the integration (tests/db) and stress (tests/stress) suites.
// They run against the throwaway TEST database only (docs/documento-GC.md §7.1).
import http from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const STOCKFISH_BIN = fileURLToPath(new URL('../../bin/stockfish.exe', import.meta.url));
export const hasStockfish = existsSync(STOCKFISH_BIN);

const SCHEMA_SQL = fileURLToPath(new URL('../../../db/schema.sql', import.meta.url));
const SEED_SQL = fileURLToPath(new URL('../../../db/seeds/01_difficulty_profiles.sql', import.meta.url));

// SAFETY GUARD: refuses to run unless DATABASE_URL points at a database whose name ends with "_test".
// resetDatabase() drops the whole public schema, so this must never be bypassed.
export function assertTestDatabaseUrl(url = process.env.DATABASE_URL) {
  if (!url) {
    throw new Error(
      'DATABASE_URL is required for DB tests, e.g. ' +
        'postgresql://test_user:test_password@127.0.0.1:5433/ajedrez_test (docker compose up -d --wait)',
    );
  }
  let name;
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    throw new Error('DATABASE_URL is not a valid URL; refusing to run DB tests');
  }
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run: database "${name}" does not end with "_test". ` +
        'DB tests DROP the public schema and only run against a throwaway test database.',
    );
  }
  return url;
}

// Builds the real application the same way src/server.js does (real repositories, pool,
// GestorDePartida, ServicioHistorial, PgnService, SessionRegistry, factory with the real
// Stockfish adapter). The AI service URL is unreachable so AI mode falls back to Stockfish.
//
// Returns a context whose service fields (app, gestor, historial, pgnService, registry) are replaced
// by restart(), so always read them from the context object instead of destructuring early.
export async function createTestContext({ movetimeMs = 1000, timeoutMs = 3000, listen = true } = {}) {
  assertTestDatabaseUrl();
  // config/env.js validates process.env on import; give it the non-DB values it requires.
  process.env.HOST ??= '127.0.0.1';
  process.env.PORT ??= '3000';
  process.env.FRONTEND_URL ??= 'http://localhost:5173';
  process.env.NODE_ENV = 'test';

  const { pool, withTransaction, checkConnection, closePool } = await import('../../src/repositories/db.js');
  const { GameRepository } = await import('../../src/repositories/GameRepository.js');
  const { MoveRepository } = await import('../../src/repositories/MoveRepository.js');
  const { DifficultyProfileRepository } = await import('../../src/repositories/DifficultyProfileRepository.js');
  const { StockfishAdapter } = await import('../../src/engines/StockfishAdapter.js');
  const { AIServiceAdapter } = await import('../../src/engines/AIServiceAdapter.js');
  const { SessionRegistry } = await import('../../src/services/SessionRegistry.js');
  const { GameSessionFactory } = await import('../../src/services/GameSessionFactory.js');
  const { GestorDePartida } = await import('../../src/services/GestorDePartida.js');
  const { DifficultyService } = await import('../../src/services/DifficultyService.js');
  const { ServicioHistorial } = await import('../../src/services/ServicioHistorial.js');
  const { PgnService } = await import('../../src/services/PgnService.js');
  const { createApp } = await import('../../src/app.js');

  const gameRepo = new GameRepository(pool);
  const moveRepo = new MoveRepository(pool);
  const difficultyRepo = new DifficultyProfileRepository(pool);

  const build = () => {
    const registry = new SessionRegistry();
    const pgnService = new PgnService({ gameRepo, moveRepo, withTransaction });
    const historial = new ServicioHistorial({ gameRepo, moveRepo, pgnService });
    const gestor = new GestorDePartida({
      gameRepo,
      moveRepo,
      difficultyRepo,
      registry,
      factory: new GameSessionFactory({
        fallbackSkillLevel: 0,
        // Port 9 (discard) on loopback: connection refused, so the AI path always falls back.
        aiAdapterFactory: () => new AIServiceAdapter({ baseUrl: 'http://127.0.0.1:9', timeoutMs: 4000 }),
        adapterFactory: ({ skillLevel }) =>
          new StockfishAdapter({ command: STOCKFISH_BIN, movetimeMs, timeoutMs, skillLevel }),
      }),
      withTransaction,
    });
    const app = createApp({
      frontendUrl: process.env.FRONTEND_URL,
      checkDb: checkConnection,
      checkAi: async () => 'not_configured',
      gestor,
      historial,
      pgnService,
      difficultyService: new DifficultyService({ difficultyRepo }),
    });
    return { registry, pgnService, historial, gestor, app };
  };

  const ctx = {
    pool,
    withTransaction,
    gameRepo,
    moveRepo,
    difficultyRepo,
    baseUrl: null,
    ...build(),
    query: (text, params) => pool.query(text, params),
    async scalar(text, params) {
      const { rows } = await pool.query(text, params);
      return Number(Object.values(rows[0])[0]);
    },
    // D-11: schema.sql is the single source of the schema; the difficulty seed is idempotent.
    async resetDatabase() {
      await ctx.registry.disposeAll();
      await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      await pool.query(await readFile(SCHEMA_SQL, 'utf8'));
      await pool.query(await readFile(SEED_SQL, 'utf8'));
    },
    // Simulates a process restart: engines die, in-memory sessions and per-game locks are lost,
    // the database survives. Services are rebuilt over the same pool.
    async restart() {
      await ctx.registry.disposeAll();
      Object.assign(ctx, build());
    },
    async close() {
      await ctx.registry.disposeAll();
      if (server) {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
      await closePool();
    },
  };

  let server = null;
  if (listen) {
    // Delegates to the current ctx.app so it keeps working across restart().
    server = http.createServer((req, res) => ctx.app(req, res));
    server.keepAliveTimeout = 60_000;
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    ctx.baseUrl = `http://127.0.0.1:${server.address().port}`;
  }
  return ctx;
}
