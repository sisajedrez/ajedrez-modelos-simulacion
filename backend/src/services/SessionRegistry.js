// In-memory gameId -> { tablero, opponent }.
export class SessionRegistry {
  #sessions = new Map();

  get(gameId) {
    return this.#sessions.get(gameId);
  }

  set(gameId, session) {
    this.#sessions.set(gameId, session);
  }

  delete(gameId) {
    return this.#sessions.delete(gameId);
  }

  clear() {
    this.#sessions.clear();
  }

  // Disposes every opponent (kills engine processes) and empties the registry.
  async disposeAll() {
    const sessions = [...this.#sessions.values()];
    this.#sessions.clear();
    await Promise.allSettled(sessions.map((s) => s.opponent?.dispose?.()));
  }
}
