import { z } from 'zod';
import { AppError } from '../errors/AppError.js';

// UCI long algebraic notation, e.g. "e2e4" or "e7e8q". The only place that knows it besides StockfishAdapter.
const UCI_MOVE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;

const predictionSchema = z.object({
  move: z.string().regex(UCI_MOVE).nullable(),
  source: z.enum(['history', 'openings', 'none']),
});

/**
 * Typed failure of the AI service. `kind` is one of:
 * not_configured | timeout | network | http | invalid_payload
 */
export class AIServiceError extends AppError {
  constructor(kind, message, { status = 502, httpStatus = null, cause } = {}) {
    super(`AI_SERVICE_${kind.toUpperCase()}`, message, status, true);
    this.name = 'AIServiceError';
    this.kind = kind;
    this.httpStatus = httpStatus;
    if (cause) this.cause = cause;
  }
}

const isTimeout = (err) => err?.name === 'TimeoutError' || err?.name === 'AbortError';

// HTTP client for the Simulación team's AI service. Never throws from health();
// every other call throws an AIServiceError.
export class AIServiceAdapter {
  #baseUrl;
  #timeoutMs;
  #fetch;

  constructor({ baseUrl, timeoutMs = 5000, fetchFn = globalThis.fetch } = {}) {
    this.#baseUrl = baseUrl ? String(baseUrl).replace(/\/+$/, '') : undefined;
    this.#timeoutMs = timeoutMs;
    this.#fetch = fetchFn;
  }

  get configured() {
    return Boolean(this.#baseUrl);
  }

  // Returns { move: {from,to,promotion?} | null, source: 'history'|'openings'|'none' }.
  async predictMove({ fen, difficulty }) {
    const body = await this.#request('POST', '/predict-move', { fen, difficulty, elo: null });
    const parsed = predictionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AIServiceError('invalid_payload', 'AI service returned an unexpected payload');
    }
    const { move, source } = parsed.data;
    if (move === null) return { move: null, source };
    const m = UCI_MOVE.exec(move);
    const out = { from: m[1], to: m[2] };
    if (m[3]) out.promotion = m[3];
    return { move: out, source };
  }

  async health() {
    if (!this.configured) return false;
    try {
      await this.#send('GET', '/health');
      return true;
    } catch {
      return false;
    }
  }

  // Initial dataset load (RN-04). Not wired to any route yet (D-12).
  seedDataset() {
    return this.#request('POST', '/dataset/seed', {});
  }

  // Retraining; the service must only use FINALIZADA games (D-12).
  trainModel() {
    return this.#request('POST', '/model/train', {});
  }

  async #request(method, path, payload) {
    const res = await this.#send(method, path, payload);
    try {
      return await res.json();
    } catch (err) {
      if (isTimeout(err)) throw new AIServiceError('timeout', `AI service timed out after ${this.#timeoutMs}ms`, { status: 504, cause: err });
      throw new AIServiceError('invalid_payload', 'AI service returned invalid JSON', { cause: err });
    }
  }

  async #send(method, path, payload) {
    if (!this.#baseUrl) {
      throw new AIServiceError('not_configured', 'AI_SERVICE_URL is not configured', { status: 503 });
    }
    let res;
    try {
      res = await this.#fetch(`${this.#baseUrl}${path}`, {
        method,
        headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (err) {
      if (isTimeout(err)) {
        throw new AIServiceError('timeout', `AI service timed out after ${this.#timeoutMs}ms`, { status: 504, cause: err });
      }
      throw new AIServiceError('network', `AI service unreachable: ${err.cause?.code ?? err.message}`, { status: 503, cause: err });
    }
    if (!res.ok) {
      throw new AIServiceError('http', `AI service answered HTTP ${res.status}`, { httpStatus: res.status });
    }
    return res;
  }
}
