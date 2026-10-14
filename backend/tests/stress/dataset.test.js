// Stress (d): AI training dataset (SEED games) plus user games in every status, at scale.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from '../db/helpers.js';
import { Tablero } from '../../src/domain/Tablero.js';
import { PGN_RESULTS } from '../../src/services/PgnService.js';
import { seedFromPgn } from '../../scripts/seed.js';
import { envInt, fmt, makeApi, mulberry32, randInt, randomGameData, report, scaled, stats } from './util.js';

const SEED_GAMES = scaled(envInt('STRESS_SEED_GAMES', 1000));
const USER_GAMES = scaled(envInt('STRESS_USER_GAMES', 200));
const FIRST_BATCH = Math.min(100, SEED_GAMES);
const BATCH = 100;

let ctx;
let api;

before(async () => {
  ctx = await createTestContext({ listen: true });
  await ctx.resetDatabase();
  api = makeApi(ctx);
});
after(async () => {
  await ctx?.close();
});

const pgnFor = (rng, i, plies) => {
  const { moves } = randomGameData(rng, plies);
  const result = PGN_RESULTS[randInt(rng, 0, 2)];
  const pgn = Tablero.aPGN(
    moves.map((m) => m.san),
    { Event: 'Synthetic dataset', White: `SeedW${i}`, Black: `SeedB${i}`, Result: result },
  );
  return { pgn, plies: moves.length, result };
};

test('dataset: SEED + USER games at scale, D-08 training filter, idempotent seed, history latency', { timeout: 900_000 }, async (t) => {
  const t0 = performance.now();
  const rng = mulberry32(777);
  const expected = { plies: 0, byResult: new Map() };
  const addExpected = (plies, result) => {
    expected.plies += plies;
    expected.byResult.set(result, (expected.byResult.get(result) ?? 0) + plies);
  };

  // ---- Seed games: first batch through seedFromPgn (idempotent entry point), the rest through PgnService.
  const seedGames = Array.from({ length: SEED_GAMES }, (_, i) => {
    const g = pgnFor(rng, i, randInt(rng, 30, 60));
    addExpected(g.plies, g.result);
    return g;
  });
  const logs = [];
  const tSeed0 = performance.now();
  const unfinished = '[Event "x"]\n[White "U"]\n[Black "U"]\n\n1. e4 e5 *'; // no result: must be skipped
  const first = await seedFromPgn(
    [...seedGames.slice(0, FIRST_BATCH).map((g) => g.pgn), ...Array(5).fill(unfinished)],
    { gameRepo: ctx.gameRepo, pgnService: ctx.pgnService, log: (m) => logs.push(m) },
  );
  assert.deepEqual(first, { alreadySeeded: false, imported: FIRST_BATCH, skipped: 5 });
  for (let from = FIRST_BATCH; from < SEED_GAMES; from += BATCH) {
    const res = await ctx.pgnService.importarLote(seedGames.slice(from, from + BATCH).map((g) => g.pgn), { source: 'SEED' });
    assert.equal(res.skipped, 0);
  }
  const seedMs = performance.now() - tSeed0;
  const seedPlies = seedGames.reduce((s, g) => s + g.plies, 0);

  // ---- User games in every status, inserted through the repositories in transactions.
  const tUser0 = performance.now();
  const facil = await ctx.difficultyRepo.findByName('FACIL');
  const userSpecs = Array.from({ length: USER_GAMES }, (_, i) => {
    const plies = randInt(rng, 4, 40);
    const { moves, fen } = randomGameData(rng, plies);
    const status = ['EN_PROGRESO', 'PENDIENTE', 'FINALIZADA'][i % 3];
    const result = status === 'FINALIZADA' ? PGN_RESULTS[randInt(rng, 0, 2)] : null;
    if (status === 'FINALIZADA') addExpected(moves.length, result);
    return { i, moves, fen, status, result, vsEngine: i % 10 === 0 };
  });
  for (let from = 0; from < userSpecs.length; from += 50) {
    await ctx.withTransaction(async (tx) => {
      for (const s of userSpecs.slice(from, from + 50)) {
        const game = await ctx.gameRepo.create(
          {
            whitePlayerName: `User${s.i}`,
            blackPlayerName: s.vsEngine ? 'Stockfish' : `Rival${s.i}`,
            mode: s.vsEngine ? 'STOCKFISH' : 'LOCAL',
            whiteType: 'HUMAN',
            blackType: s.vsEngine ? 'ENGINE' : 'HUMAN',
            difficultyProfileId: s.vsEngine ? facil.id : null,
            currentFen: s.fen,
            status: s.status,
            result: s.result,
          },
          tx,
        );
        for (const m of s.moves) await ctx.moveRepo.create({ gameId: game.id, ...m }, tx);
      }
    });
  }
  const userMs = performance.now() - tUser0;

  // ---- Volume checks.
  assert.equal(await ctx.scalar(`SELECT COUNT(*) FROM games WHERE source='SEED'`), SEED_GAMES);
  assert.equal(await ctx.scalar(`SELECT COUNT(*) FROM games WHERE source='SEED' AND status<>'FINALIZADA'`), 0);
  assert.equal(await ctx.scalar(`SELECT COUNT(*) FROM games WHERE source='USER'`), USER_GAMES);
  for (const s of ['EN_PROGRESO', 'PENDIENTE', 'FINALIZADA']) {
    assert.ok((await ctx.scalar(`SELECT COUNT(*) FROM games WHERE source='USER' AND status=$1`, [s])) >= Math.floor(USER_GAMES / 3));
  }
  const totalMoves = await ctx.scalar('SELECT COUNT(*) FROM moves');

  // ---- D-08: findTrainingMoves returns exactly the moves of FINALIZADA games.
  const trainingLat = [];
  let training;
  for (let k = 0; k < 3; k++) {
    const s = performance.now();
    training = await ctx.moveRepo.findTrainingMoves();
    trainingLat.push(performance.now() - s);
  }
  const sqlCount = await ctx.scalar(
    `SELECT COALESCE(SUM(c), 0) FROM (
       SELECT (SELECT COUNT(*) FROM moves WHERE game_id = g.id) AS c FROM games g WHERE g.status = 'FINALIZADA'
     ) t`,
  );
  assert.equal(training.length, sqlCount, 'findTrainingMoves count equals the independent SQL count');
  assert.equal(training.length, expected.plies, 'and equals the plies generated for FINALIZADA games');
  assert.ok(training.length < totalMoves, 'moves of EN_PROGRESO/PENDIENTE games are excluded');
  assert.ok(training.every((r) => PGN_RESULTS.includes(r.result)), 'no row from a game without a final result');
  for (const [result, plies] of expected.byResult) {
    assert.equal(training.filter((r) => r.result === result).length, plies, `rows for result ${result}`);
  }
  assert.ok(training.every((r) => typeof r.fenBefore === 'string' && typeof r.san === 'string'));

  // ---- History listing: filters and pagination through the API, validated against SQL.
  const listLat = [];
  const list = async (qs) => {
    const res = await api('GET', `/games?${qs}`);
    assert.equal(res.status, 200, res.text);
    listLat.push(res.ms);
    return res.body;
  };
  const cases = [
    ['limit=50', `SELECT COUNT(*) FROM games`],
    ['mode=LOCAL&limit=50', `SELECT COUNT(*) FROM games WHERE mode='LOCAL'`],
    ['mode=STOCKFISH&difficulty=FACIL&limit=50', `SELECT COUNT(*) FROM games WHERE mode='STOCKFISH'`],
    ['status=FINALIZADA&limit=50', `SELECT COUNT(*) FROM games WHERE status='FINALIZADA'`],
    ['status=PENDIENTE&limit=50', `SELECT COUNT(*) FROM games WHERE status='PENDIENTE'`],
    ['status=FINALIZADA&result=1-0&limit=50', `SELECT COUNT(*) FROM games WHERE status='FINALIZADA' AND result='1-0'`],
    ['result=1/2-1/2&limit=200&offset=100', `SELECT COUNT(*) FROM games WHERE result='1/2-1/2'`],
  ];
  for (const [qs, sql] of cases) {
    for (let k = 0; k < 3; k++) {
      const body = await list(qs);
      assert.equal(body.total, await ctx.scalar(sql), qs);
    }
  }
  const sample = await list('status=FINALIZADA&limit=50');
  for (const item of sample.items) {
    assert.equal(item.moveCount, await ctx.scalar('SELECT COUNT(*) FROM moves WHERE game_id = $1', [item.id]));
  }

  // Full pagination walk over everything: pages are disjoint, complete and ordered.
  const seen = new Set();
  let prev = null;
  let total = 0;
  for (let offset = 0; ; offset += 200) {
    const page = await list(`limit=200&offset=${offset}`);
    total = page.total;
    for (const item of page.items) {
      assert.ok(!seen.has(item.id), 'no game appears on two pages');
      seen.add(item.id);
      if (prev) assert.ok(new Date(item.startedAt) <= new Date(prev), 'ordered by started_at DESC');
      prev = item.startedAt;
    }
    if (page.items.length < 200) break;
  }
  assert.equal(seen.size, total);
  assert.equal(total, SEED_GAMES + USER_GAMES);

  // ---- Seed idempotency at scale: a second run inserts nothing.
  const again = await seedFromPgn(seedGames.map((g) => g.pgn), {
    gameRepo: ctx.gameRepo,
    pgnService: ctx.pgnService,
    log: (m) => logs.push(m),
  });
  assert.deepEqual(again, { alreadySeeded: true, imported: 0, skipped: 0 });
  assert.equal(await ctx.scalar(`SELECT COUNT(*) FROM games WHERE source='SEED'`), SEED_GAMES);
  assert.equal(await ctx.scalar('SELECT COUNT(*) FROM moves'), totalMoves);

  const totalMs = performance.now() - t0;
  report('DATASET', [
    `seed games ${SEED_GAMES} (${seedPlies} plies, avg ${(seedPlies / SEED_GAMES).toFixed(1)}) loaded in ${(seedMs / 1000).toFixed(1)}s`,
    `user games ${USER_GAMES} loaded in ${(userMs / 1000).toFixed(1)}s; total games ${SEED_GAMES + USER_GAMES}, total moves ${totalMoves}`,
    `findTrainingMoves: ${training.length} rows (FINALIZADA only; SQL count ${sqlCount}), latency ${fmt(stats(trainingLat))}`,
    `history list (filters + pagination, ${listLat.length} requests): ${fmt(stats(listLat))}`,
    `second seed run: alreadySeeded=true, inserted 0`,
    `total time: ${(totalMs / 1000).toFixed(1)}s`,
  ]);
  t.diagnostic(`seed=${SEED_GAMES} user=${USER_GAMES} training=${training.length} findTraining ${fmt(stats(trainingLat))} list ${fmt(stats(listLat))}`);
});
