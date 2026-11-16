// Stress (b): Stockfish at maximum level (DIFICIL, skill 20) with the real binary and production timings.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { createTestContext, hasStockfish } from '../db/helpers.js';
import { envInt, fmt, makeApi, mulberry32, pickMove, report, sleep, stats, stockfishProcessCount } from './util.js';

const skip = hasStockfish ? false : 'bin/stockfish.exe not present';
const ENGINE_MOVES = envInt('STRESS_SF_ENGINE_MOVES', 15);
const MAX_GAMES = 14; // retry budget: a random human is sometimes mated before 15 engine moves
const WARM_BUDGET_MS = 3000; // production STOCKFISH_TIMEOUT_MS
const COLD_BUDGET_MS = 13_000; // startup (10 s) + search (3 s)

let ctx;
let api;
let baselineProcs = 0;

before(async () => {
  if (skip) return;
  baselineProcs = await stockfishProcessCount();
  // Production timings: movetime 1000, timeout 3000.
  ctx = await createTestContext({ movetimeMs: 1000, timeoutMs: 3000 });
  await ctx.resetDatabase();
  api = makeApi(ctx);
});
after(async () => {
  await ctx?.close();
});

// Plays one DIFICIL game: seeded-random human vs engine until `engineMoves` engine plies exist or the
// game ends. Returns the evidence collected along the way.
async function playGame({ seed, humanColor }) {
  const rng = mulberry32(seed);
  const chess = new Chess();
  const humanIsWhite = humanColor === 'WHITE';
  const engineColor = humanIsWhite ? 'BLACK' : 'WHITE';
  const created = await api('POST', '/games', {
    mode: 'STOCKFISH',
    alias: `Human-${seed}`,
    difficulty: 'DIFICIL',
    playerColor: humanColor,
  });
  assert.equal(created.status, 201, created.text);
  const id = created.body.id;
  const engineLatencies = [];
  let engineMoves = 0;
  let status = 'EN_PROGRESO';

  const applyEngine = (body) => {
    assert.equal(body.valid, true);
    assert.equal(body.engineSource, 'stockfish');
    const m = chess.move(body.san); // throws if the engine's SAN is not legal in our mirror board
    assert.ok(m);
    engineMoves++;
    status = body.status;
  };

  if (!humanIsWhite) {
    // The engine opens: creation itself runs the cold start + first search.
    assert.equal(created.body.engineError, undefined, `engine opening failed: ${JSON.stringify(created.body.engineError)}`);
    const detail = await api('GET', `/games/${id}`);
    assert.equal(detail.body.moves.length, 1);
    applyEngine({ valid: true, engineSource: 'stockfish', san: detail.body.moves[0].san, status: 'EN_PROGRESO' });
    engineLatencies.push({ ms: created.ms, cold: true });
  }

  while (status === 'EN_PROGRESO' && engineMoves < ENGINE_MOVES) {
    const human = pickMove(chess, rng);
    assert.ok(human, 'human has a legal move');
    const hRes = await api('POST', `/games/${id}/moves`, human);
    assert.equal(hRes.status, 200, hRes.text);
    chess.move(human);
    if (hRes.body.status === 'FINALIZADA') {
      status = 'FINALIZADA';
      break;
    }
    const eRes = await api('POST', `/games/${id}/engine-move`);
    assert.equal(eRes.status, 200, `engine-move failed: ${eRes.text}`); // includes "zero ENGINE_TIMEOUT"
    assert.notEqual(eRes.body?.error?.code, 'ENGINE_TIMEOUT');
    applyEngine(eRes.body);
    engineLatencies.push({ ms: eRes.ms, cold: engineLatencies.length === 0 });
  }

  // Everything was persisted and legal: replay the stored SANs on a fresh board.
  const detail = await api('GET', `/games/${id}`);
  const replay = new Chess();
  for (const m of detail.body.moves) replay.move(m.san);
  assert.equal(replay.fen(), detail.body.fen, 'stored moves replay to the stored position');
  assert.equal(replay.fen(), chess.fen());
  assert.equal(detail.body.moves.length, chess.history().length);
  const persistedEngine = detail.body.moves.filter((m) => m.color === engineColor);
  assert.equal(persistedEngine.length, engineMoves, 'every engine move is persisted');
  assert.ok(persistedEngine.every((m) => m.timeSpentMs !== null && m.timeSpentMs < WARM_BUDGET_MS + 10_000));
  return { seed, humanColor, id, engineMoves, ended: status === 'FINALIZADA', latencies: engineLatencies, plies: chess.history().length };
}

test('Stockfish DIFICIL (skill 20): real binary, production timings, no timeouts, nothing left behind', { skip, timeout: 900_000 }, async (t) => {
  const t0 = performance.now();
  const games = [];
  const qualified = { WHITE: 0, BLACK: 0 };
  let seed = 100;
  // Retry other seeds if a random human is mated before reaching the engine-move target.
  while (games.length < MAX_GAMES && (qualified.WHITE < 1 || qualified.BLACK < 1)) {
    const humanColor = qualified.WHITE < 1 && (qualified.BLACK >= 1 || games.length % 2 === 0) ? 'WHITE' : 'BLACK';
    const g = await playGame({ seed: seed++, humanColor });
    games.push(g);
    if (g.engineMoves >= ENGINE_MOVES) qualified[humanColor]++;
  }
  assert.ok(qualified.WHITE >= 1 && qualified.BLACK >= 1, `needed a full game per colour, got ${JSON.stringify(qualified)}`);

  const cold = games.flatMap((g) => g.latencies.filter((l) => l.cold).map((l) => l.ms));
  const warm = games.flatMap((g) => g.latencies.filter((l) => !l.cold).map((l) => l.ms));
  assert.ok(cold.every((ms) => ms < COLD_BUDGET_MS), `cold start within ${COLD_BUDGET_MS} ms: ${cold}`);
  assert.ok(warm.every((ms) => ms < WARM_BUDGET_MS), `warm engine moves under ${WARM_BUDGET_MS} ms; max ${Math.max(...warm)}`);

  // No engine process may survive once sessions are released.
  await ctx.registry.disposeAll();
  let procs = await stockfishProcessCount();
  for (let i = 0; i < 20 && procs > baselineProcs; i++) {
    await sleep(250);
    procs = await stockfishProcessCount();
  }
  assert.ok(procs <= baselineProcs, `stockfish processes left: ${procs} (baseline ${baselineProcs})`);

  const st = stats(warm);
  report('STOCKFISH MAX (DIFICIL, skill 20, movetime 1000, timeout 3000)', [
    ...games.map((g) => `seed ${g.seed} human ${g.humanColor}: ${g.engineMoves} engine moves, ${g.plies} plies${g.ended ? ' (game ended)' : ''}`),
    `engine moves total: ${cold.length + warm.length}, ENGINE_TIMEOUT: 0`,
    `cold start latency (first move per game): ${cold.map((c) => c.toFixed(0)).join('ms, ')}ms`,
    `warm engine-move latency: ${fmt(st)}`,
    `stockfish processes left: ${procs - baselineProcs} (baseline ${baselineProcs})`,
    `total time: ${((performance.now() - t0) / 1000).toFixed(1)}s`,
  ]);
  t.diagnostic(`engine moves=${cold.length + warm.length} warm ${fmt(st)} procs_left=${procs - baselineProcs}`);
});
