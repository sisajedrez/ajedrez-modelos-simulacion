import { AppError } from '../errors/AppError.js';
import { Tablero } from '../domain/Tablero.js';
import { toGameDto } from './gameDto.js';

export const PGN_RESULTS = ['1-0', '0-1', '1/2-1/2'];
const MAX_NAME = 100;

const invalidPgn = (detail) =>
  new AppError('INVALID_PGN', `Invalid PGN: ${detail}`, 422);

const pad = (n) => String(n).padStart(2, '0');

function pgnDate(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '????.??.??';
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

const tagName = (value) => {
  const name = typeof value === 'string' ? value.trim() : '';
  return !name || name === '?' ? 'Unknown' : name.slice(0, MAX_NAME);
};

// Splits a multi-game PGN file at each "[Event" tag. Text with no Event tag is one game.
export function splitPgnGames(text) {
  const normalized = String(text).replace(/\r\n?/g, '\n');
  return normalized
    .split(/^(?=\[Event\s)/m)
    .map((g) => g.trim())
    .filter(Boolean);
}

export class PgnService {
  constructor({ gameRepo, moveRepo, withTransaction }) {
    this.gameRepo = gameRepo;
    this.moveRepo = moveRepo;
    this.withTransaction = withTransaction;
  }

  // Builds PGN text for a stored game (finished or pending) from its ordered SAN history.
  exportar(game, moves) {
    const finished = game.status === 'FINALIZADA' && PGN_RESULTS.includes(game.result);
    return Tablero.aPGN(
      moves.map((m) => m.san),
      {
        Event: 'UNViMe Chess',
        Site: 'UNViMe',
        Date: pgnDate(game.startedAt),
        Round: '-',
        White: game.whitePlayerName,
        Black: game.blackPlayerName,
        Result: finished ? game.result : '*',
      },
    );
  }

  // Parses one game and decides how it would be stored. Throws INVALID_PGN (422).
  analizar(pgnText) {
    let parsed;
    try {
      parsed = Tablero.desdePGN(pgnText);
    } catch (err) {
      throw invalidPgn(err.message);
    }
    const tag = parsed.headers.Result;
    const result = PGN_RESULTS.includes(tag) ? tag : (parsed.finalState?.result ?? null);
    return {
      whitePlayerName: tagName(parsed.headers.White),
      blackPlayerName: tagName(parsed.headers.Black),
      moves: parsed.moves,
      currentFen: parsed.fen,
      status: result ? 'FINALIZADA' : 'PENDIENTE',
      result,
    };
  }

  async #persistir(plan, source, tx) {
    const game = await this.gameRepo.create(
      {
        whitePlayerName: plan.whitePlayerName,
        blackPlayerName: plan.blackPlayerName,
        mode: 'LOCAL',
        whiteType: 'HUMAN',
        blackType: 'HUMAN',
        difficultyProfileId: null,
        currentFen: plan.currentFen,
        status: plan.status,
        result: plan.result,
        source,
      },
      tx,
    );
    for (const m of plan.moves) {
      await this.moveRepo.create({ gameId: game.id, evalScore: null, timeSpentMs: null, ...m }, tx);
    }
    return game;
  }

  // POST /games/import: validates first, then stores game + moves in ONE transaction.
  async importar(pgnText) {
    const plan = this.analizar(pgnText);
    const game = await this.withTransaction((tx) => this.#persistir(plan, 'USER', tx));
    return { ...toGameDto(game), source: game.source, moveCount: plan.moves.length };
  }

  // Seed import: all-or-nothing in one transaction. Games without a decisive/draw result are
  // skipped and counted. Any invalid game aborts before anything is written.
  async importarLote(pgnTexts, { source = 'SEED' } = {}) {
    const plans = pgnTexts.map((t, i) => {
      try {
        return this.analizar(t);
      } catch (err) {
        throw new AppError('INVALID_PGN', `Game #${i + 1}: ${err.message}`, 422);
      }
    });
    const finished = plans.filter((p) => p.status === 'FINALIZADA');
    await this.withTransaction(async (tx) => {
      for (const plan of finished) await this.#persistir(plan, source, tx);
    });
    return { imported: finished.length, skipped: plans.length - finished.length };
  }
}
