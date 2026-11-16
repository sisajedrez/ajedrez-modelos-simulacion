import { OpponentStrategy } from './OpponentStrategy.js';

// Humans move through the API, so there is nothing to compute.
export class HumanOpponent extends OpponentStrategy {
  get isHuman() {
    return true;
  }

  async getNextMove() {
    throw new Error('HumanOpponent does not generate moves; humans move via the API');
  }
}
