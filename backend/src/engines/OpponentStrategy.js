// Interface for whoever plays the other side. Implementations: HumanOpponent,
// StockfishOpponent (AI strategy comes in a later stage).
export class OpponentStrategy {
  get isHuman() {
    return false;
  }

  // eslint-disable-next-line no-unused-vars
  async getNextMove(fen) {
    throw new Error('getNextMove() not implemented');
  }

  // Releases any external resource (processes, sockets). Must be idempotent.
  async dispose() {}
}
