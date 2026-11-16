import { OpponentStrategy } from './OpponentStrategy.js';

// Plays the engine side through a StockfishAdapter (one adapter per game, so the
// skill level from the difficulty profile stays fixed for the session).
export class StockfishOpponent extends OpponentStrategy {
  constructor({ adapter, skillLevel }) {
    super();
    this.adapter = adapter;
    this.skillLevel = skillLevel;
  }

  get isHuman() {
    return false;
  }

  getNextMove(fen) {
    return this.adapter.getBestMove(fen);
  }

  dispose() {
    return this.adapter.dispose();
  }
}
