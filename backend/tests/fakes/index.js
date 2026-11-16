import { randomUUID } from 'node:crypto';
import { Chess } from 'chess.js';
import { GestorDePartida } from '../../src/services/GestorDePartida.js';
import { SessionRegistry } from '../../src/services/SessionRegistry.js';
import { GameSessionFactory } from '../../src/services/GameSessionFactory.js';
import { AIServiceAdapter } from '../../src/engines/AIServiceAdapter.js';
import { DifficultyService } from '../../src/services/DifficultyService.js';
import { PgnService } from '../../src/services/PgnService.js';
import { ServicioHistorial } from '../../src/services/ServicioHistorial.js';

// Shared in-memory "database": plain arrays of camelCase rows.
export function createStore() {
  return {
    games: [],
    moves: [],
    profiles: [
      { id: randomUUID(), name: 'FACIL', skillLevel: 3, searchDepth: null, timeLimitMs: 1000 },
      { id: randomUUID(), name: 'MEDIO', skillLevel: 10, searchDepth: null, timeLimitMs: 1000 },
      { id: randomUUID(), name: 'DIFICIL', skillLevel: 20, searchDepth: null, timeLimitMs: 1000 },
    ],
  };
}

export class FakeGameRepository {
  constructor(store) {
    this.store = store;
  }

  async create(game) {
    const row = {
      id: randomUUID(),
      status: 'EN_PROGRESO',
      result: null,
      startedAt: new Date(),
      endedAt: null,
      source: 'USER',
      difficultyProfileId: null,
      ...game,
    };
    if (row.status === 'FINALIZADA' && !row.endedAt) row.endedAt = new Date();
    this.store.games.push(row);
    return { ...row };
  }

  async findById(id) {
    const row = this.store.games.find((g) => g.id === id);
    return row ? { ...row } : null;
  }

  async updateFen(id, fen) {
    const row = this.store.games.find((g) => g.id === id);
    row.currentFen = fen;
    return { ...row };
  }

  async finish(id, { result }) {
    const row = this.store.games.find((g) => g.id === id);
    Object.assign(row, { status: 'FINALIZADA', result, endedAt: new Date() });
    return { ...row };
  }

  async updateStatus(id, status) {
    const row = this.store.games.find((g) => g.id === id);
    if (!row) return null;
    row.status = status;
    return { ...row };
  }

  async pausarEnProgreso() {
    const active = this.store.games.filter((g) => g.status === 'EN_PROGRESO');
    for (const g of active) g.status = 'PENDIENTE';
    return active.length;
  }

  async existsBySource(source) {
    return this.store.games.some((g) => g.source === source);
  }

  // Mirrors GameRepository.list: filters, newest first, move counts, paging, total before paging.
  async list({ mode, difficulty, status, result, limit = 50, offset = 0 } = {}) {
    const profileName = (g) => this.store.profiles.find((p) => p.id === g.difficultyProfileId)?.name ?? null;
    const matches = this.store.games
      .filter((g) => !mode || g.mode === mode)
      .filter((g) => !difficulty || profileName(g) === difficulty)
      .filter((g) => !status || g.status === status)
      .filter((g) => !result || g.result === result)
      .reverse() // later inserts first, so equal timestamps stay newest-first
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    return {
      total: matches.length,
      items: matches.slice(offset, offset + limit).map((g) => ({
        id: g.id,
        startedAt: g.startedAt,
        endedAt: g.endedAt ?? null,
        whitePlayerName: g.whitePlayerName,
        blackPlayerName: g.blackPlayerName,
        mode: g.mode,
        difficulty: profileName(g),
        moveCount: this.store.moves.filter((m) => m.gameId === g.id).length,
        status: g.status,
        result: g.result ?? null,
        source: g.source,
      })),
    };
  }
}

export class FakeMoveRepository {
  constructor(store) {
    this.store = store;
  }

  async create(move) {
    const row = { id: randomUUID(), createdAt: new Date(), ...move };
    this.store.moves.push(row);
    return { ...row };
  }

  async findByGameId(gameId) {
    return this.store.moves.filter((m) => m.gameId === gameId).map((m) => ({ ...m }));
  }

  async findTrainingMoves() {
    return this.store.moves
      .map((m) => ({ m, g: this.store.games.find((x) => x.id === m.gameId) }))
      .filter(({ g }) => g?.status === 'FINALIZADA')
      .map(({ m, g }) => ({ fenBefore: m.fenBefore, san: m.san, result: g.result }));
  }
}

export class FakeDifficultyProfileRepository {
  constructor(store) {
    this.store = store;
  }

  async findAll() {
    return this.store.profiles.map((p) => ({ ...p }));
  }

  async findById(id) {
    const p = this.store.profiles.find((x) => x.id === id);
    return p ? { ...p } : null;
  }

  async findByName(name) {
    const p = this.store.profiles.find((x) => x.name === name);
    return p ? { ...p } : null;
  }
}

// Snapshot/rollback transaction: any throw restores the previous rows.
export function createFakeWithTransaction(store) {
  return async (fn) => {
    const snapshot = structuredClone({ games: store.games, moves: store.moves });
    try {
      return await fn({ fake: true });
    } catch (err) {
      store.games.splice(0, store.games.length, ...snapshot.games);
      store.moves.splice(0, store.moves.length, ...snapshot.moves);
      throw err;
    }
  };
}

// Fake engine adapter factory: records created adapters, can script moves or fail.
export function createFakeEngine() {
  const engine = {
    created: [],
    script: [],
    failWith: null,
    adapterFactory({ skillLevel }) {
      const adapter = {
        skillLevel,
        disposed: 0,
        fens: [],
        async getBestMove(fen) {
          adapter.fens.push(fen);
          if (engine.failWith) throw engine.failWith;
          if (engine.script.length) return engine.script.shift();
          const m = new Chess(fen).moves({ verbose: true })[0];
          return { from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) };
        },
        async dispose() {
          adapter.disposed += 1;
        },
      };
      engine.created.push(adapter);
      return adapter;
    },
  };
  return engine;
}

// `aiUrl` points the AI adapter at a FakeAIServer (or a dead port); omit it for "not configured".
export function createTestContext({ engine, aiUrl, aiTimeoutMs = 300, logger = { warn() {} } } = {}) {
  const warnings = [];
  const store = createStore();
  const registry = new SessionRegistry();
  const difficultyRepo = new FakeDifficultyProfileRepository(store);
  const gameRepo = new FakeGameRepository(store);
  const moveRepo = new FakeMoveRepository(store);
  const withTransaction = createFakeWithTransaction(store);
  const pgnService = new PgnService({ gameRepo, moveRepo, withTransaction });
  const historial = new ServicioHistorial({ gameRepo, moveRepo, pgnService });
  const gestor = new GestorDePartida({
    gameRepo,
    moveRepo,
    difficultyRepo,
    registry,
    factory: new GameSessionFactory({
      adapterFactory: engine?.adapterFactory,
      aiAdapterFactory: () => new AIServiceAdapter({ baseUrl: aiUrl, timeoutMs: aiTimeoutMs }),
      logger: { warn: (m) => { warnings.push(m); logger.warn(m); } },
    }),
    withTransaction,
  });
  const difficultyService = new DifficultyService({ difficultyRepo });
  return { store, registry, gestor, historial, pgnService, gameRepo, moveRepo, difficultyService, warnings };
}
