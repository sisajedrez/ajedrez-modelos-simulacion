import { OpponentStrategy } from './OpponentStrategy.js';
import { Tablero } from '../domain/Tablero.js';

// Plays the AI side: asks the AI service, verifies the move on the board, and falls back to a
// weak Stockfish (RN-02) whenever the service cannot give a legal move. Never plays random moves.
export class CustomAIOpponent extends OpponentStrategy {
  #adapter;
  #difficulty;
  #fallbackFactory;
  #fallback = null;
  #logger;

  // fallbackFactory() -> OpponentStrategy (a StockfishOpponent at the fallback skill level).
  constructor({ adapter, difficulty, fallbackFactory, logger = console }) {
    super();
    this.#adapter = adapter;
    this.#difficulty = difficulty;
    this.#fallbackFactory = fallbackFactory;
    this.#logger = logger;
  }

  get isHuman() {
    return false;
  }

  async getNextMove(fen) {
    let reason;
    try {
      const { move, source } = await this.#adapter.predictMove({ fen, difficulty: this.#difficulty });
      if (source === 'none') reason = 'source_none';
      else if (!move) reason = 'null_move';
      else if (!new Tablero(fen).validarMovimientoLegal(move).legal) reason = 'illegal_move';
      else return { ...move, source };
    } catch (err) {
      reason = err?.kind ? `${err.kind}${err.httpStatus ? ` ${err.httpStatus}` : ''}` : `error: ${err?.message}`;
    }
    return this.#fallBack(fen, reason);
  }

  async #fallBack(fen, reason) {
    this.#logger.warn(`[CustomAIOpponent] falling back to Stockfish (${reason})`);
    this.#fallback ??= this.#fallbackFactory();
    const move = await this.#fallback.getNextMove(fen);
    return { ...move, source: 'fallback' };
  }

  async dispose() {
    const fallback = this.#fallback;
    this.#fallback = null;
    await fallback?.dispose();
  }
}
