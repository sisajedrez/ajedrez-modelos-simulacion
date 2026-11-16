// Stress (c): many saved and resumed games, restart recovery, and per-game locking under a real pool.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { createTestContext, hasStockfish } from '../db/helpers.js';
import {
  envInt,
  fmt,
  makeApi,
  mapPool,
  mulberry32,
  pickMove,
  randInt,
  report,
  scaled,
  sleep,
  stats,
  stockfishProcessCount,
} from './util.js';

const TOTAL_GAMES = scaled(envInt('STRESS_MANY_GAMES', 300), 20);
const SF_GAMES = hasStockfish ? Math.min(10, Math.max(1, Math.round(TOTAL_GAMES / 30))) : 0;
const CONCURRENCY = envInt('STRESS_CONCURRENCY', 20);
// Cold-starting many Stockfish processes at once is serialized by the OS on this setup
// (5 concurrent spawns take ~10 s, past the 10 s startup timeout), so engine games get their own small pool.
const SF_CONCURRENCY = envInt('STRESS_SF_CONCURRENCY', 2);

// Runs fn over games: LOCAL games with CONCURRENCY in flight, engine games with SF_CONCURRENCY.
async function forEachGame(items, fn) {
  const isSf = (x) => x.sf === true;
  const [a, b] = await Promise.all([
    mapPool(items.filter((x) => !isSf(x)), CONCURRENCY, fn),
    mapPool(items.filter(isSf), SF_CONCURRENCY, fn),
  ]);
  return [...a, ...b];
}

let ctx;
let api;
let baselineProcs = 0;

before(async () => {
  baselineProcs = await stockfishProcessCount();
  // Engine games here only need legal replies, so a short search keeps the scenario quick.
  ctx = await createTestContext({ movetimeMs: 100, timeoutMs: 3000 });
  await ctx.resetDatabase();
  api = makeApi(ctx);
});
after(async () => {
  await ctx?.close();
});

const turnOf = (fen) => (fen.split(' ')[1] === 'w' ? 'WHITE' : 'BLACK');

test('300 saved games: pause, restart, startup recovery, resume, one more legal move each', { timeout: 900_000 }, async (t) => {
  const t0 = performance.now();
  const lat = { create: [], move: [], engine: [], pause: [], resume: [] };

  // ---- Phase 1: create and play 4..10 plies per game with bounded concurrency.
  const specs = Array.from({ length: TOTAL_GAMES }, (_, i) => ({ i, sf: i < SF_GAMES }));
  const games = (await forEachGame(specs, async ({ i, sf }) => {
    const rng = mulberry32(1000 + i);
    const target = randInt(rng, 4, 10);
    const chess = new Chess();
    const created = await api(
      'POST',
      '/games',
      sf ? { mode: 'STOCKFISH', alias: `P${i}`, difficulty: 'FACIL' } : { mode: 'LOCAL', alias: `P${i}` },
    );
    assert.equal(created.status, 201, created.text);
    lat.create.push(created.ms);
    const id = created.body.id;
    let finished = false;
    while (chess.history().length < target && !finished) {
      const humanTurn = !sf || chess.turn() === 'w';
      if (humanTurn) {
        const mv = pickMove(chess, rng);
        const res = await api('POST', `/games/${id}/moves`, mv);
        assert.equal(res.status, 200, res.text);
        lat.move.push(res.ms);
        chess.move(mv);
        finished = res.body.status === 'FINALIZADA';
      } else {
        const res = await api('POST', `/games/${id}/engine-move`);
        assert.equal(res.status, 200, res.text);
        lat.engine.push(res.ms);
        chess.move(res.body.san);
        finished = res.body.status === 'FINALIZADA';
      }
    }
    return { id, i, sf, chess, finished };
  })).sort((x, y) => x.i - y.i);
  assert.equal(await ctx.scalar('SELECT COUNT(*) FROM games'), TOTAL_GAMES);

  // Plan: 70% paused, 20% left EN_PROGRESO (orphaned by the "crash"), 10% resigned.
  const kind = (g) => (g.finished ? 'finished' : g.i % 10 < 7 ? 'pause' : g.i % 10 < 9 ? 'orphan' : g.sf ? 'orphan' : 'resign');
  const byKind = (k) => games.filter((g) => kind(g) === k);

  await mapPool(byKind('pause'), CONCURRENCY, async (g) => {
    const res = await api('POST', `/games/${g.id}/pause`);
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.status, 'PENDIENTE');
    lat.pause.push(res.ms);
  });
  await mapPool(byKind('resign'), CONCURRENCY, async (g) => {
    const res = await api('POST', `/games/${g.id}/resign`, {});
    assert.equal(res.status, 200, res.text);
  });

  const paused = byKind('pause').length;
  const orphans = byKind('orphan').length;
  const finishedGames = games.length - paused - orphans;
  assert.equal(await ctx.scalar(`SELECT COUNT(*) FROM games WHERE status='PENDIENTE'`), paused);
  assert.equal(await ctx.scalar(`SELECT COUNT(*) FROM games WHERE status='EN_PROGRESO'`), orphans);
  assert.equal(await ctx.scalar(`SELECT COUNT(*) FROM games WHERE status='FINALIZADA'`), finishedGames);

  // ---- Phase 2: simulated restart + startup recovery.
  await ctx.restart();
  api = makeApi(ctx);
  assert.equal(ctx.registry.get(games[0].id), undefined, 'no session survives a restart');
  const recovered = await ctx.gestor.recuperarPartidasHuerfanas();
  assert.equal(recovered, orphans, 'every orphaned EN_PROGRESO game is recovered');
  assert.equal(await ctx.scalar(`SELECT COUNT(*) FROM games WHERE status='EN_PROGRESO'`), 0);
  assert.equal(await ctx.scalar(`SELECT COUNT(*) FROM games WHERE status='PENDIENTE'`), paused + orphans);
  assert.equal(await ctx.scalar(`SELECT COUNT(*) FROM games WHERE status='FINALIZADA'`), finishedGames);
  for (const g of byKind('orphan')) {
    assert.equal((await ctx.gameRepo.findById(g.id)).status, 'PENDIENTE');
  }

  // ---- Phase 3: resume everything, check position/turn, play one more legal move.
  const resumable = [...byKind('pause'), ...byKind('orphan')];
  let extraMoves = 0;
  await forEachGame(resumable, async (g) => {
    const expectedFen = g.chess.fen();
    const res = await api('POST', `/games/${g.id}/resume`);
    assert.equal(res.status, 200, res.text);
    lat.resume.push(res.ms);
    assert.equal(res.body.status, 'EN_PROGRESO');
    assert.equal(res.body.fen, expectedFen, `fen after resume (game ${g.i})`);
    assert.equal(res.body.turn, turnOf(expectedFen));
    assert.equal((await ctx.gameRepo.findById(g.id)).currentFen, expectedFen);

    const rng = mulberry32(5000 + g.i);
    const engineTurn = g.sf && g.chess.turn() === 'b';
    let next;
    if (engineTurn) {
      next = await api('POST', `/games/${g.id}/engine-move`);
      assert.equal(next.status, 200, next.text);
      g.chess.move(next.body.san);
    } else {
      const mv = pickMove(g.chess, rng);
      next = await api('POST', `/games/${g.id}/moves`, mv);
      assert.equal(next.status, 200, next.text);
      g.chess.move(mv);
    }
    extraMoves++;
    assert.equal(next.body.fen, g.chess.fen());
    assert.equal(await ctx.scalar('SELECT COUNT(*) FROM moves WHERE game_id = $1', [g.id]), g.chess.history().length);
    assert.equal((await ctx.gameRepo.findById(g.id)).currentFen, g.chess.fen());
  });
  assert.equal(extraMoves, resumable.length);
  assert.equal(await ctx.scalar(`SELECT COUNT(*) FROM games WHERE status='EN_PROGRESO'`), resumable.length);

  // Global integrity: no duplicated plies anywhere, every game's moves replay to its current_fen.
  assert.equal(
    await ctx.scalar(`SELECT COUNT(*) FROM (SELECT 1 FROM moves GROUP BY game_id, move_number, color HAVING COUNT(*) > 1) d`),
    0,
  );
  const sample = games.filter((_, idx) => idx % 15 === 0);
  for (const g of sample) {
    const detail = await api('GET', `/games/${g.id}`);
    const replay = new Chess();
    for (const m of detail.body.moves) replay.move(m.san);
    assert.equal(replay.fen(), detail.body.fen);
  }

  await ctx.registry.disposeAll();
  const totalMs = performance.now() - t0;
  report('MANY GAMES', [
    `games: ${TOTAL_GAMES} (${SF_GAMES} STOCKFISH FACIL), concurrency ${CONCURRENCY}`,
    `paused ${paused}, orphaned->recovered ${recovered}, resigned/finished ${finishedGames}, resumed ${resumable.length}, extra moves ${extraMoves}`,
    `create: ${fmt(stats(lat.create))}`,
    `human move: ${fmt(stats(lat.move))}`,
    ...(lat.engine.length ? [`engine move (movetime 100): ${fmt(stats(lat.engine))}`] : []),
    `pause: ${fmt(stats(lat.pause))}`,
    `resume: ${fmt(stats(lat.resume))}`,
    `total time: ${(totalMs / 1000).toFixed(1)}s`,
  ]);
  t.diagnostic(`games=${TOTAL_GAMES} recovered=${recovered} resumed=${resumable.length} total=${(totalMs / 1000).toFixed(1)}s`);
});

test('20 concurrent moves on the SAME game: exactly one ply per accepted move, no duplicates', { timeout: 120_000 }, async (t) => {
  const ROUNDS = 6;
  const PARALLEL = 20;
  const created = await api('POST', '/games', { mode: 'LOCAL', alias: 'Race' });
  const id = created.body.id;
  const chess = new Chess();
  const latencies = [];
  let rejected = 0;

  for (let round = 1; round <= ROUNDS; round++) {
    // Every request is a legal move of the side to move in the SAME position; only the first to
    // acquire the per-game lock can be accepted, the rest see the new position and are illegal.
    const legal = chess.moves({ verbose: true });
    const bodies = Array.from({ length: PARALLEL }, (_, k) => {
      const m = legal[k % legal.length];
      return m.promotion ? { from: m.from, to: m.to, promotion: m.promotion } : { from: m.from, to: m.to };
    });
    const results = await Promise.all(bodies.map((b) => api('POST', `/games/${id}/moves`, b)));
    results.forEach((r) => latencies.push(r.ms));
    const accepted = results.filter((r) => r.status === 200);
    const refused = results.filter((r) => r.status !== 200);
    // Duplicated bodies of the accepted move are legal only once; identical copies are illegal afterwards.
    assert.equal(accepted.length, 1, `round ${round}: exactly one accepted, got ${accepted.length}`);
    assert.ok(
      refused.every((r) => r.status === 422 && r.body.error.code === 'ILLEGAL_MOVE'),
      `round ${round}: others are ILLEGAL_MOVE, got ${[...new Set(refused.map((r) => r.status))]}`,
    );
    rejected += refused.length;
    chess.move(accepted[0].body.san);
    assert.equal(accepted[0].body.fen, chess.fen());
    assert.equal(await ctx.scalar('SELECT COUNT(*) FROM moves WHERE game_id = $1', [id]), round);
  }

  const rows = (await ctx.query('SELECT move_number, color, san FROM moves WHERE game_id = $1', [id])).rows;
  assert.equal(rows.length, ROUNDS);
  assert.equal(new Set(rows.map((r) => `${r.move_number}-${r.color}`)).size, ROUNDS, 'no duplicated move rows');
  assert.equal((await ctx.gameRepo.findById(id)).currentFen, chess.fen(), 'final FEN consistent');
  const detail = await api('GET', `/games/${id}`);
  assert.deepEqual(detail.body.moves.map((m) => m.san), chess.history());

  // Concurrent traffic on many games at once also keeps each game consistent (distinct locks).
  const ids = await mapPool(Array.from({ length: 10 }, (_, k) => k), 10, async (k) => {
    const g = (await api('POST', '/games', { mode: 'LOCAL', alias: `Multi${k}` })).body.id;
    const results = await Promise.all(
      Array.from({ length: 10 }, () => api('POST', `/games/${g}/moves`, { from: 'e2', to: 'e4' })),
    );
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    return g;
  });
  for (const g of ids) assert.equal(await ctx.scalar('SELECT COUNT(*) FROM moves WHERE game_id = $1', [g]), 1);

  report('SAME-GAME CONCURRENCY', [
    `${ROUNDS} rounds x ${PARALLEL} concurrent moves: accepted ${ROUNDS}, refused ${rejected}, rows persisted ${rows.length}`,
    `request latency: ${fmt(stats(latencies))}`,
  ]);
  t.diagnostic(`rounds=${ROUNDS} parallel=${PARALLEL} accepted=${ROUNDS} refused=${rejected}`);
});

test('no stockfish process left after the scenario', { skip: !hasStockfish }, async () => {
  await ctx.registry.disposeAll();
  let procs = await stockfishProcessCount();
  for (let i = 0; i < 20 && procs > baselineProcs; i++) {
    await sleep(250);
    procs = await stockfishProcessCount();
  }
  assert.ok(procs <= baselineProcs, `stockfish processes left: ${procs} (baseline ${baselineProcs})`);
});
