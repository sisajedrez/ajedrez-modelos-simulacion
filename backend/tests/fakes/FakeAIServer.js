import http from 'node:http';
import { Chess } from 'chess.js';

// Real HTTP server standing in for the Simulación team's AI service.
// Behaviours: history | openings | none | illegal | malformed | error500 | slow
export class FakeAIServer {
  constructor({ behavior = 'history', slowMs = 400 } = {}) {
    this.behavior = behavior;
    this.slowMs = slowMs;
    this.move = null; // optional fixed UCI answer for history/openings
    this.requests = []; // { method, url, body }
    this.server = http.createServer((req, res) => this.#handle(req, res));
    this.url = null;
  }

  async start() {
    await new Promise((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${this.server.address().port}`;
    return this;
  }

  async stop() {
    this.server.closeAllConnections?.();
    await new Promise((resolve) => this.server.close(resolve));
  }

  // The last legal move, so it differs from the fake Stockfish (which plays the first one).
  static #pick(fen) {
    const moves = new Chess(fen).moves({ verbose: true });
    const m = moves[moves.length - 1];
    return `${m.from}${m.to}${m.promotion ?? ''}`;
  }

  #handle(req, res) {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let body = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = raw;
      }
      this.requests.push({ method: req.method, url: req.url, body });
      const json = (status, payload) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      if (req.url === '/health') return json(200, { status: 'ok' });
      if (req.url !== '/predict-move') return json(200, { status: 'ok' });
      switch (this.behavior) {
        case 'history':
        case 'openings':
          return json(200, { move: this.move ?? FakeAIServer.#pick(body.fen), source: this.behavior });
        case 'none':
          return json(200, { move: null, source: 'none' });
        case 'illegal':
          return json(200, { move: 'a1a8', source: 'history' });
        case 'malformed':
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end('{"move": ');
        case 'wrongshape':
          return json(200, { mov: 'e2e4' });
        case 'error500':
          return json(500, { detail: 'boom' });
        case 'slow':
          return void setTimeout(() => {
            if (!res.destroyed) json(200, { move: FakeAIServer.#pick(body.fen), source: 'history' });
          }, this.slowMs);
        default:
          return json(500, {});
      }
    });
  }
}

// A URL on a port that nothing listens on (connection refused).
export async function closedPortUrl() {
  const s = new FakeAIServer();
  await s.start();
  const url = s.url;
  await s.stop();
  return url;
}
