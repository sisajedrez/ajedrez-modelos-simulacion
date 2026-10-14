import { AppError } from '../errors/AppError.js';
import { Tablero } from '../domain/Tablero.js';
import { START_FEN, normalizarFEN, turnoDesdeFEN } from '../domain/fen.js';
import { toGameDto } from './gameDto.js';

const notFound = () => new AppError('GAME_NOT_FOUND', 'Game not found', 404);
const notActive = () => new AppError('GAME_NOT_ACTIVE', 'Game is not in progress', 409);

const notPending = () => new AppError('GAME_NOT_PENDING', 'Game is not paused', 409);
const toDto = toGameDto;

export class GestorDePartida {
  #locks = new Map();

  constructor({ gameRepo, moveRepo, difficultyRepo, registry, factory, withTransaction }) {
    this.gameRepo = gameRepo;
    this.moveRepo = moveRepo;
    this.difficultyRepo = difficultyRepo;
    this.registry = registry;
    this.factory = factory;
    this.withTransaction = withTransaction;
  }

  // Serializes operations per game so concurrent requests cannot interleave.
  async #exclusivo(gameId, fn) {
    const previo = this.#locks.get(gameId) ?? Promise.resolve();
    const actual = previo.then(fn);
    const cola = actual.catch(() => {});
    this.#locks.set(gameId, cola);
    try {
      return await actual;
    } finally {
      if (this.#locks.get(gameId) === cola) this.#locks.delete(gameId);
    }
  }

  async crearPartida({ mode, alias, difficulty, playerColor = 'WHITE' }) {
    let profile = null;
    if (difficulty) {
      profile = await this.difficultyRepo.findByName(difficulty);
      if (!profile) {
        throw new AppError('VALIDATION_ERROR', `Unknown difficulty: ${difficulty}`, 400);
      }
    }
    const vsEngine = mode === 'STOCKFISH' || mode === 'AI';
    if (vsEngine && !profile) {
      throw new AppError('VALIDATION_ERROR', `difficulty is required for ${mode} games`, 400);
    }

    // Fail early (501) for unsupported modes, before touching the database.
    const session = this.factory.create(mode, { skillLevel: profile?.skillLevel, difficulty: profile?.name });

    const humanWhite = playerColor === 'WHITE';
    const other = mode === 'AI' ? 'AI' : vsEngine ? 'Stockfish' : 'Player 2';
    const otherType = mode === 'AI' ? 'AI' : vsEngine ? 'ENGINE' : 'HUMAN';
    let game;
    try {
      game = await this.gameRepo.create({
        whitePlayerName: humanWhite ? alias : other,
        blackPlayerName: humanWhite ? other : alias,
        mode,
        whiteType: humanWhite ? 'HUMAN' : otherType,
        blackType: humanWhite ? otherType : 'HUMAN',
        difficultyProfileId: profile?.id ?? null,
        currentFen: START_FEN,
      });
    } catch (err) {
      await session.opponent.dispose();
      throw err;
    }
    this.registry.set(game.id, session);

    if (!(vsEngine && !humanWhite)) return toDto(game);

    // The engine opens as white. A failure is reported, not fatal: the client retries via /engine-move.
    let engineError;
    try {
      await this.#exclusivo(game.id, () => this.#ejecutarMotor(game.id));
    } catch (err) {
      engineError = { code: err.code ?? 'INTERNAL_ERROR', retryable: err.retryable ?? true };
    }
    const fresh = (await this.gameRepo.findById(game.id)) ?? game;
    return engineError ? { ...toDto(fresh), engineError } : toDto(fresh);
  }

  async #cargarActiva(gameId) {
    const game = await this.gameRepo.findById(gameId);
    if (!game) throw notFound();
    if (game.status !== 'EN_PROGRESO') throw notActive();
    return game;
  }

  async #sesion(game) {
    const existente = this.registry.get(game.id);
    if (existente) return existente;
    const session = await this.#reconstruirSesion(game);
    this.registry.set(game.id, session);
    return session;
  }

  // Rebuilds board (from stored SAN history) and opponent; does not register the session.
  async #reconstruirSesion(game) {
    const moves = await this.moveRepo.findByGameId(game.id);
    const tablero = Tablero.desdeHistorial(moves.map((m) => m.san));
    if (normalizarFEN(tablero.fen()) !== normalizarFEN(game.currentFen)) {
      throw new AppError('SESSION_INCONSISTENT', 'Stored moves do not match the game position', 500);
    }
    let profile = null;
    if ((game.mode === 'STOCKFISH' || game.mode === 'AI') && game.difficultyProfileId) {
      profile = await this.difficultyRepo.findById(game.difficultyProfileId);
    }
    return this.factory.create(game.mode, {
      tablero,
      skillLevel: profile?.skillLevel,
      difficulty: profile?.name,
    });
  }

  // Drops the in-memory session and releases its opponent (engine process).
  async #descartarSesion(gameId) {
    const session = this.registry.get(gameId);
    this.registry.delete(gameId);
    try {
      await session?.opponent?.dispose?.();
    } catch {
      // Disposal is best effort; the session is gone either way.
    }
  }

  static #turnoDelMotor(game) {
    if (game.mode !== 'STOCKFISH' && game.mode !== 'AI') return false;
    const type = turnoDesdeFEN(game.currentFen) === 'WHITE' ? game.whiteType : game.blackType;
    return type === 'ENGINE' || type === 'AI';
  }

  // Shared validate -> transaction (move + fen [+ finish]) -> game-over pipeline for human and engine moves.
  async #aplicarJugada(gameId, tablero, { from, to, promotion }, { onIllegal, timeSpentMs = null, engineSource }) {
    const jugada = tablero.jugar({ from, to, promotion });
    if (!jugada.legal) throw onIllegal();
    const final = tablero.estadoFinal();

    try {
      await this.withTransaction(async (tx) => {
        await this.moveRepo.create(
          {
            gameId,
            moveNumber: jugada.moveNumber,
            color: jugada.color,
            san: jugada.san,
            fenBefore: jugada.fenBefore,
            fenAfter: jugada.fenAfter,
            evalScore: null,
            timeSpentMs,
          },
          tx,
        );
        await this.gameRepo.updateFen(gameId, jugada.fenAfter, tx);
        if (final) await this.gameRepo.finish(gameId, { result: final.result }, tx);
      });
    } catch (err) {
      // The in-memory board is ahead of the database: drop it so it is rebuilt.
      await this.#descartarSesion(gameId);
      throw err;
    }

    if (final) await this.#descartarSesion(gameId);
    return {
      valid: true,
      san: jugada.san,
      fen: jugada.fenAfter,
      status: final ? 'FINALIZADA' : 'EN_PROGRESO',
      result: final?.result ?? null,
      endReason: final?.endReason ?? null,
      ...(engineSource ? { engineSource } : {}),
    };
  }

  realizarJugada(gameId, { from, to, promotion }) {
    return this.#exclusivo(gameId, async () => {
      const game = await this.#cargarActiva(gameId);
      if (GestorDePartida.#turnoDelMotor(game)) {
        throw new AppError('NOT_YOUR_TURN', "It is the engine's turn", 409);
      }
      const { tablero } = await this.#sesion(game);
      return this.#aplicarJugada(
        gameId,
        tablero,
        { from, to, promotion },
        {
          onIllegal: () =>
            new AppError('ILLEGAL_MOVE', `Illegal move: ${from}${to}${promotion ?? ''}`, 422),
        },
      );
    });
  }

  jugarTurnoMaquina(gameId) {
    return this.#exclusivo(gameId, () => this.#ejecutarMotor(gameId));
  }

  // Must run inside the per-game lock.
  async #ejecutarMotor(gameId) {
    const game = await this.#cargarActiva(gameId);
    if (!GestorDePartida.#turnoDelMotor(game)) {
      throw new AppError('NOT_ENGINE_TURN', "It is not the engine's turn", 409);
    }
    const { tablero, opponent } = await this.#sesion(game);
    const inicio = Date.now();
    const movimiento = await opponent.getNextMove(tablero.fen());
    const timeSpentMs = Date.now() - inicio;
    // AI opponents report where the move came from (history | openings | fallback).
    const { source, ...jugada } = movimiento ?? {};
    return this.#aplicarJugada(gameId, tablero, jugada, {
      timeSpentMs,
      engineSource: game.mode === 'AI' ? (source ?? 'fallback') : 'stockfish',
      onIllegal: () => new AppError('ENGINE_ILLEGAL_MOVE', 'Engine produced an illegal move', 500, false),
    });
  }

  async obtenerMovimientosLegales(gameId, square) {
    const game = await this.#cargarActiva(gameId);
    const { tablero } = await this.#sesion(game);
    return tablero.movimientosLegales(square);
  }

  // EN_PROGRESO -> PENDIENTE; releases the opponent (engine process) and the in-memory session.
  pausarPartida(gameId) {
    return this.#exclusivo(gameId, async () => {
      await this.#cargarActiva(gameId);
      const updated = await this.gameRepo.updateStatus(gameId, 'PENDIENTE');
      await this.#descartarSesion(gameId);
      return toDto(updated);
    });
  }

  // PENDIENTE -> EN_PROGRESO; rebuilds board and opponent. Never moves for the machine:
  // when it is the engine's turn the client calls /engine-move.
  reanudarPartida(gameId) {
    return this.#exclusivo(gameId, async () => {
      const game = await this.gameRepo.findById(gameId);
      if (!game) throw notFound();
      if (game.status !== 'PENDIENTE') throw notPending();
      const session = await this.#reconstruirSesion(game);
      let updated;
      try {
        updated = await this.gameRepo.updateStatus(gameId, 'EN_PROGRESO');
      } catch (err) {
        await session.opponent?.dispose?.();
        throw err;
      }
      this.registry.set(gameId, session);
      return toDto(updated);
    });
  }

  // Startup recovery: sessions do not survive a restart, so EN_PROGRESO games are orphaned.
  recuperarPartidasHuerfanas() {
    return this.gameRepo.pausarEnProgreso();
  }

  rendirse(gameId, { color } = {}) {
    return this.#exclusivo(gameId, async () => {
      const game = await this.#cargarActiva(gameId);
      const loser = color ?? turnoDesdeFEN(game.currentFen);
      const result = loser === 'WHITE' ? '0-1' : '1-0';
      await this.withTransaction((tx) => this.gameRepo.finish(gameId, { result }, tx));
      await this.#descartarSesion(gameId);
      return { valid: true, status: 'FINALIZADA', result, endReason: 'RESIGNATION' };
    });
  }
}
