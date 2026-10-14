// Helpers for the stress scenarios: seeded PRNG, random legal moves, stats, HTTP client, promise pool.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Chess } from 'chess.js';

const execFileAsync = promisify(execFile);

// STRESS_SCALE multiplies every default size (1 = the documented defaults).
export const SCALE = Number(process.env.STRESS_SCALE ?? 1) > 0 ? Number(process.env.STRESS_SCALE ?? 1) : 1;
export const scaled = (n, min = 1) => Math.max(min, Math.round(n * SCALE));
export const envInt = (name, fallback) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

// Picks a uniformly random legal move of the side to move: { from, to, promotion? } or null.
export function pickMove(chess, rng) {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;
  const m = moves[Math.floor(rng() * moves.length)];
  return m.promotion ? { from: m.from, to: m.to, promotion: m.promotion } : { from: m.from, to: m.to };
}

// Plays up to `maxPlies` seeded-random plies in memory (no game-over rule checks beyond "no moves").
// Returns [{ moveNumber, color, san, fenBefore, fenAfter }] and the final fen.
export function randomGameData(rng, maxPlies) {
  const chess = new Chess();
  for (let i = 0; i < maxPlies; i++) {
    const mv = pickMove(chess, rng);
    if (!mv) break;
    chess.move(mv);
  }
  const moves = chess.history({ verbose: true }).map((m, i) => ({
    moveNumber: Math.floor(i / 2) + 1,
    color: m.color === 'w' ? 'WHITE' : 'BLACK',
    san: m.san,
    fenBefore: m.before,
    fenAfter: m.after,
  }));
  return { moves, fen: chess.fen() };
}

export function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export function stats(values) {
  const s = [...values].sort((a, b) => a - b);
  return {
    n: s.length,
    p50: percentile(s, 50),
    p95: percentile(s, 95),
    max: s.length ? s[s.length - 1] : 0,
  };
}

export const fmt = (st) => `n=${st.n} p50=${st.p50.toFixed(1)}ms p95=${st.p95.toFixed(1)}ms max=${st.max.toFixed(1)}ms`;

// Minimal JSON client over fetch against ctx.baseUrl; every call reports its latency in ms.
export function makeApi(ctx) {
  return async function call(method, path, body) {
    const t0 = performance.now();
    const res = await fetch(ctx.baseUrl + path, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const ms = performance.now() - t0;
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // Non-JSON bodies (PGN export) are returned through `text`.
    }
    return { status: res.status, body: json, text, ms };
  };
}

// Runs fn(item, index) over items with at most `limit` in flight; results keep input order.
export async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (next < items.length && !failed) {
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        failed = true; // stop feeding workers so nothing keeps running after the first failure
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Number of running stockfish.exe processes (Windows tasklist; pgrep elsewhere).
export async function stockfishProcessCount() {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('tasklist', ['/FI', 'IMAGENAME eq stockfish.exe', '/FO', 'CSV', '/NH']);
      return stdout.split(/\r?\n/).filter((l) => l.toLowerCase().includes('stockfish.exe')).length;
    }
    const { stdout } = await execFileAsync('pgrep', ['-c', 'stockfish']);
    return Number(stdout.trim()) || 0;
  } catch {
    return 0; // pgrep exits 1 when nothing matches
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function report(title, lines) {
  console.log(`\n[stress] ${title}`);
  for (const l of lines) console.log(`[stress]   ${l}`);
}
