import { spawn } from 'node:child_process';
import path from 'node:path';
import { AppError } from '../errors/AppError.js';

const UCI_MOVE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;
const QUIT_GRACE_MS = 500;
const DEFAULT_STARTUP_TIMEOUT_MS = 10000;

const unavailable = (message) => new AppError('ENGINE_UNAVAILABLE', message, 503, true);

// Resolves relative file paths against the cwd; bare command names stay PATH lookups.
function resolveCommand(command) {
  if (!command) return command;
  return /[\\/]/.test(command) ? path.resolve(process.cwd(), command) : command;
}

// Parses "bestmove e7e8q ponder ..." into { from, to, promotion? }. The only place that knows UCI.
function parseBestMove(line) {
  const token = line.split(/\s+/)[1];
  if (!token || token === '(none)') {
    throw new AppError('ENGINE_NO_MOVE', 'Engine returned no move', 502, false);
  }
  const m = UCI_MOVE.exec(token);
  if (!m) throw new AppError('ENGINE_PROTOCOL_ERROR', `Unparseable engine move: ${token}`, 502, false);
  const move = { from: m[1], to: m[2] };
  if (m[3]) move.promotion = m[3];
  return move;
}

// Talks UCI to one Stockfish process. Lazy start, serialized requests, one overall
// deadline per request, transparent restart after a timeout or crash.
export class StockfishAdapter {
  #command;
  #args;
  #env;
  #movetimeMs;
  #timeoutMs;
  #startupTimeoutMs;
  #skillLevel;
  #spawnFn;
  #proc = null;
  #partial = '';
  #queue = [];
  #waiter = null;
  #failure = null;
  #chain = Promise.resolve();
  #disposed = false;
  #disposing = null;

  constructor({
    command,
    args = [],
    env,
    movetimeMs = 1000,
    timeoutMs = 3000,
    startupTimeoutMs = DEFAULT_STARTUP_TIMEOUT_MS,
    skillLevel = 0,
    spawnFn = spawn,
  }) {
    this.#command = resolveCommand(command);
    this.#args = args;
    this.#env = env;
    this.#movetimeMs = movetimeMs;
    this.#timeoutMs = timeoutMs;
    this.#startupTimeoutMs = startupTimeoutMs;
    this.#skillLevel = skillLevel;
    this.#spawnFn = spawnFn;
  }

  get pid() {
    return this.#proc?.pid;
  }

  getBestMove(fen) {
    const run = this.#chain.then(() => this.#search(fen));
    this.#chain = run.catch(() => {});
    return run;
  }

  async #search(fen) {
    if (this.#disposed) throw unavailable('Engine adapter has been disposed');
    if (!this.#command) throw unavailable('STOCKFISH_PATH is not configured');
    if (typeof fen !== 'string' || /[\r\n]/.test(fen)) throw new TypeError('Invalid FEN');

    this.#failure = null;
    // Cold start (loading the NNUE net) gets its own budget; STOCKFISH_TIMEOUT_MS bounds the search only.
    if (!this.#proc) {
      await this.#withDeadline(this.#startupTimeoutMs, 'start', () => this.#start());
    }
    return this.#withDeadline(this.#timeoutMs, 'answer', async () => {
      this.#send('isready');
      await this.#waitFor((l) => l === 'readyok');
      this.#send(`position fen ${fen}`);
      this.#send(`go movetime ${this.#movetimeMs}`);
      const line = await this.#waitFor((l) => l.startsWith('bestmove'));
      return parseBestMove(line);
    });
  }

  async #withDeadline(ms, verb, fn) {
    const timer = setTimeout(
      () => this.#abort(new AppError('ENGINE_TIMEOUT', `Engine did not ${verb} within ${ms}ms`, 504, true)),
      ms,
    );
    try {
      return await fn();
    } finally {
      clearTimeout(timer);
    }
  }

  async #start() {
    let proc;
    try {
      proc = this.#spawnFn(this.#command, this.#args, {
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true,
        ...(this.#env ? { env: { ...process.env, ...this.#env } } : {}),
      });
    } catch (err) {
      throw unavailable(`Cannot start Stockfish: ${err.message}`);
    }
    this.#proc = proc;
    this.#partial = '';
    this.#queue = [];
    proc.stdin.on('error', () => {});
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => this.#onData(proc, chunk));
    proc.on('error', (err) => this.#onGone(proc, unavailable(`Cannot start Stockfish: ${err.message}`)));
    proc.on('exit', () => this.#onGone(proc, unavailable('Stockfish exited unexpectedly')));

    this.#send('uci');
    await this.#waitFor((l) => l === 'uciok');
    this.#send(`setoption name Skill Level value ${this.#skillLevel}`);
  }

  #send(line) {
    const stdin = this.#proc?.stdin;
    if (stdin && !stdin.destroyed) stdin.write(`${line}\n`);
  }

  #onData(proc, chunk) {
    if (proc !== this.#proc) return;
    this.#partial += chunk;
    const lines = this.#partial.split(/\r?\n/);
    this.#partial = lines.pop();
    for (const l of lines) this.#queue.push(l.trim());
    this.#drain();
  }

  #drain() {
    const w = this.#waiter;
    if (!w) return;
    while (this.#queue.length) {
      const line = this.#queue.shift();
      if (w.pred(line)) {
        this.#waiter = null;
        w.resolve(line);
        return;
      }
    }
  }

  #waitFor(pred) {
    return new Promise((resolve, reject) => {
      if (this.#failure) return reject(this.#failure);
      this.#waiter = { pred, resolve, reject };
      this.#drain();
    });
  }

  #fail(err) {
    this.#failure ??= err;
    const w = this.#waiter;
    this.#waiter = null;
    w?.reject(this.#failure);
  }

  #onGone(proc, err) {
    if (proc !== this.#proc) return;
    this.#proc = null;
    this.#fail(err);
  }

  #abort(err) {
    const proc = this.#proc;
    this.#proc = null;
    proc?.kill();
    this.#fail(err);
  }

  // Sends `quit`, kills if the process lingers. Safe to call repeatedly.
  dispose() {
    this.#disposing ??= this.#shutdown();
    return this.#disposing;
  }

  async #shutdown() {
    this.#disposed = true;
    const proc = this.#proc;
    this.#proc = null;
    this.#fail(unavailable('Engine adapter has been disposed'));
    if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
    const exited = new Promise((resolve) => proc.once('exit', resolve));
    if (!proc.stdin.destroyed) proc.stdin.write('quit\n', () => {});
    let timer;
    const grace = new Promise((resolve) => {
      timer = setTimeout(resolve, QUIT_GRACE_MS, 'timeout');
    });
    const outcome = await Promise.race([exited, grace]);
    clearTimeout(timer);
    if (outcome === 'timeout') {
      proc.kill();
      await exited;
    }
  }
}
