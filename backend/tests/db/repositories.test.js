// Integration tests: the real SQL (repositories, transactions) and the API over a real PostgreSQL.
// Requires DATABASE_URL pointing at a "*_test" database (see tests/stress/README.md).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createTestContext, assertTestDatabaseUrl } from './helpers.js';
import { START_FEN } from '../../src/domain/fen.js';

let ctx;

before(async () => {
  assertTestDatabaseUrl();
  ctx = await createTestContext({ listen: false });
});
after(async () => {
  await ctx?.close();
});
beforeEach(async () => {
  await ctx.resetDatabase();
});

const baseGame = (extra = {}) => ({
  whitePlayerName: 'Ana',
  blackPlayerName: 'Bo',
  mode: 'LOCAL',
  whiteType: 'HUMAN',
  blackType: 'HUMAN',
  currentFen: START_FEN,
  ...extra,
});

const baseMove = (gameId, extra = {}) => ({
  gameId,
  moveNumber: 1,
  color: 'WHITE',
  san: 'e4',
  fenBefore: START_FEN,
  fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
  ...extra,
});

const countRows = (table) => ctx.scalar(`SELECT COUNT(*) FROM ${table}`);

// ---------------------------------------------------------------- DifficultyProfileRepository

test('DifficultyProfileRepository: findAll / findById / findByName against the seeded profiles', async () => {
  const all = await ctx.difficultyRepo.findAll();
  assert.deepEqual(
    all.map((p) => [p.name, p.skillLevel, p.searchDepth, p.timeLimitMs]),
    [
      ['FACIL', 3, null, 1000],
      ['MEDIO', 10, null, 1000],
      ['DIFICIL', 20, null, 1000],
    ],
  );
  const medio = await ctx.difficultyRepo.findByName('MEDIO');
  assert.equal(medio.skillLevel, 10);
  assert.deepEqual(await ctx.difficultyRepo.findById(medio.id), medio);
  assert.equal(await ctx.difficultyRepo.findByName('NOPE'), null);
  assert.equal(await ctx.difficultyRepo.findById(randomUUID()), null);
});

test('difficulty seed is idempotent (re-running inserts nothing)', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const sql = await readFile(fileURLToPath(new URL('../../../db/seeds/01_difficulty_profiles.sql', import.meta.url)), 'utf8');
  await ctx.query(sql);
  assert.equal(await countRows('difficulty_profiles'), 3);
});

// ---------------------------------------------------------------- GameRepository

test('GameRepository.create applies DB defaults and findById round-trips', async () => {
  const g = await ctx.gameRepo.create(baseGame());
  assert.match(g.id, /^[0-9a-f-]{36}$/);
  assert.equal(g.status, 'EN_PROGRESO');
  assert.equal(g.source, 'USER');
  assert.equal(g.result, null);
  assert.equal(g.endedAt, null);
  assert.equal(g.difficultyProfileId, null);
  assert.ok(g.startedAt instanceof Date);
  assert.deepEqual(await ctx.gameRepo.findById(g.id), g);
  assert.equal(await ctx.gameRepo.findById(randomUUID()), null);
});

test('GameRepository.create: FINALIZADA gets ended_at, SEED source and difficulty are stored', async () => {
  const profile = await ctx.difficultyRepo.findByName('DIFICIL');
  const done = await ctx.gameRepo.create(
    baseGame({ status: 'FINALIZADA', result: '1-0', source: 'SEED', mode: 'STOCKFISH', whiteType: 'HUMAN', blackType: 'ENGINE', difficultyProfileId: profile.id }),
  );
  assert.equal(done.status, 'FINALIZADA');
  assert.equal(done.result, '1-0');
  assert.equal(done.source, 'SEED');
  assert.ok(done.endedAt instanceof Date);
  assert.equal(done.difficultyProfileId, profile.id);
  const pending = await ctx.gameRepo.create(baseGame({ status: 'PENDIENTE' }));
  assert.equal(pending.status, 'PENDIENTE');
  assert.equal(pending.endedAt, null);
});

test('GameRepository: DB constraints reject bad enums and unknown difficulty ids', async () => {
  await assert.rejects(ctx.gameRepo.create(baseGame({ mode: 'NOPE' })), /invalid input value for enum/);
  await assert.rejects(ctx.gameRepo.create(baseGame({ difficultyProfileId: randomUUID() })), /foreign key/);
  assert.equal(await countRows('games'), 0);
});

test('GameRepository.updateFen / updateStatus / finish', async () => {
  const g = await ctx.gameRepo.create(baseGame());
  const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  assert.equal((await ctx.gameRepo.updateFen(g.id, fen)).currentFen, fen);
  assert.equal((await ctx.gameRepo.findById(g.id)).currentFen, fen);

  assert.equal((await ctx.gameRepo.updateStatus(g.id, 'PENDIENTE')).status, 'PENDIENTE');
  assert.equal((await ctx.gameRepo.updateStatus(g.id, 'EN_PROGRESO')).status, 'EN_PROGRESO');

  const fin = await ctx.gameRepo.finish(g.id, { result: '0-1' });
  assert.equal(fin.status, 'FINALIZADA');
  assert.equal(fin.result, '0-1');
  assert.ok(fin.endedAt instanceof Date);

  const ghost = randomUUID();
  assert.equal(await ctx.gameRepo.updateFen(ghost, fen), null);
  assert.equal(await ctx.gameRepo.updateStatus(ghost, 'PENDIENTE'), null);
  assert.equal(await ctx.gameRepo.finish(ghost, { result: '1-0' }), null);
  await assert.rejects(ctx.gameRepo.updateStatus(g.id, 'BOGUS'), /invalid input value for enum/);
});

test('GameRepository.pausarEnProgreso moves only EN_PROGRESO games and returns the count', async () => {
  for (let i = 0; i < 3; i++) await ctx.gameRepo.create(baseGame());
  await ctx.gameRepo.create(baseGame({ status: 'PENDIENTE' }));
  await ctx.gameRepo.create(baseGame({ status: 'FINALIZADA', result: '1-0' }));
  assert.equal(await ctx.gameRepo.pausarEnProgreso(), 3);
  assert.equal(await ctx.scalar(`SELECT COUNT(*) FROM games WHERE status='PENDIENTE'`), 4);
  assert.equal(await ctx.scalar(`SELECT COUNT(*) FROM games WHERE status='FINALIZADA'`), 1);
  assert.equal(await ctx.gameRepo.pausarEnProgreso(), 0);
});

test('GameRepository.existsBySource', async () => {
  assert.equal(await ctx.gameRepo.existsBySource('SEED'), false);
  await ctx.gameRepo.create(baseGame());
  assert.equal(await ctx.gameRepo.existsBySource('SEED'), false);
  assert.equal(await ctx.gameRepo.existsBySource('USER'), true);
  await ctx.gameRepo.create(baseGame({ status: 'FINALIZADA', result: '1/2-1/2', source: 'SEED' }));
  assert.equal(await ctx.gameRepo.existsBySource('SEED'), true);
});

async function seedHistory() {
  const facil = await ctx.difficultyRepo.findByName('FACIL');
  const dificil = await ctx.difficultyRepo.findByName('DIFICIL');
  const specs = [
    { n: 'g1', mode: 'LOCAL', status: 'FINALIZADA', result: '1-0', moves: 3 },
    { n: 'g2', mode: 'LOCAL', status: 'FINALIZADA', result: '0-1', moves: 2 },
    { n: 'g3', mode: 'LOCAL', status: 'PENDIENTE', moves: 1 },
    { n: 'g4', mode: 'STOCKFISH', status: 'FINALIZADA', result: '1/2-1/2', diff: facil, moves: 0 },
    { n: 'g5', mode: 'STOCKFISH', status: 'EN_PROGRESO', diff: dificil, moves: 4 },
    { n: 'g6', mode: 'STOCKFISH', status: 'FINALIZADA', result: '1-0', diff: dificil, moves: 2 },
    { n: 'g7', mode: 'AI', status: 'PENDIENTE', diff: facil, moves: 1 },
  ];
  const ids = {};
  for (const [i, s] of specs.entries()) {
    const g = await ctx.gameRepo.create(
      baseGame({
        whitePlayerName: s.n,
        mode: s.mode,
        blackType: s.mode === 'LOCAL' ? 'HUMAN' : 'ENGINE',
        status: s.status,
        result: s.result,
        difficultyProfileId: s.diff?.id,
      }),
    );
    // Deterministic order: g1 oldest ... g7 newest.
    await ctx.query(`UPDATE games SET started_at = TIMESTAMP '2024-01-01 00:00:00' + ($2 || ' minutes')::interval WHERE id = $1`, [g.id, i]);
    for (let m = 0; m < s.moves; m++) {
      await ctx.moveRepo.create(baseMove(g.id, { moveNumber: Math.floor(m / 2) + 1, color: m % 2 ? 'BLACK' : 'WHITE' }));
    }
    ids[s.n] = g.id;
  }
  return ids;
}

test('GameRepository.list: every filter, counts, ordering, move_count', async () => {
  const ids = await seedHistory();
  const names = (r) => r.items.map((i) => i.whitePlayerName);

  const all = await ctx.gameRepo.list();
  assert.equal(all.total, 7);
  assert.deepEqual(names(all), ['g7', 'g6', 'g5', 'g4', 'g3', 'g2', 'g1']); // started_at DESC
  const byName = Object.fromEntries(all.items.map((i) => [i.whitePlayerName, i]));
  assert.equal(byName.g1.moveCount, 3);
  assert.equal(byName.g4.moveCount, 0); // LEFT JOIN keeps games without moves
  assert.equal(byName.g5.moveCount, 4);
  assert.equal(byName.g1.id, ids.g1);
  assert.equal(byName.g1.difficulty, null);
  assert.equal(byName.g5.difficulty, 'DIFICIL');
  assert.equal(byName.g4.difficulty, 'FACIL');
  assert.equal(byName.g1.source, 'USER');

  assert.deepEqual(names(await ctx.gameRepo.list({ mode: 'LOCAL' })), ['g3', 'g2', 'g1']);
  assert.deepEqual(names(await ctx.gameRepo.list({ mode: 'STOCKFISH' })), ['g6', 'g5', 'g4']);
  assert.deepEqual(names(await ctx.gameRepo.list({ mode: 'AI' })), ['g7']);
  assert.deepEqual(names(await ctx.gameRepo.list({ difficulty: 'DIFICIL' })), ['g6', 'g5']);
  assert.deepEqual(names(await ctx.gameRepo.list({ difficulty: 'FACIL' })), ['g7', 'g4']);
  assert.deepEqual(names(await ctx.gameRepo.list({ status: 'FINALIZADA' })), ['g6', 'g4', 'g2', 'g1']);
  assert.deepEqual(names(await ctx.gameRepo.list({ status: 'PENDIENTE' })), ['g7', 'g3']);
  assert.deepEqual(names(await ctx.gameRepo.list({ status: 'EN_PROGRESO' })), ['g5']);
  assert.deepEqual(names(await ctx.gameRepo.list({ result: '1-0' })), ['g6', 'g1']);
  assert.deepEqual(names(await ctx.gameRepo.list({ result: '1/2-1/2' })), ['g4']);
  // Combined filters
  const combo = await ctx.gameRepo.list({ mode: 'STOCKFISH', difficulty: 'DIFICIL', status: 'FINALIZADA', result: '1-0' });
  assert.deepEqual(names(combo), ['g6']);
  assert.equal(combo.total, 1);
  const none = await ctx.gameRepo.list({ mode: 'LOCAL', difficulty: 'DIFICIL' });
  assert.deepEqual(none, { total: 0, items: [] });
});

test('GameRepository.list: pagination pages are disjoint, complete and total ignores limit/offset', async () => {
  await seedHistory();
  const seen = [];
  for (let offset = 0; offset < 8; offset += 3) {
    const page = await ctx.gameRepo.list({ limit: 3, offset });
    assert.equal(page.total, 7);
    seen.push(...page.items.map((i) => i.whitePlayerName));
  }
  assert.deepEqual(seen, ['g7', 'g6', 'g5', 'g4', 'g3', 'g2', 'g1']);
  const beyond = await ctx.gameRepo.list({ limit: 3, offset: 50 });
  assert.deepEqual(beyond, { total: 7, items: [] });
  const filtered = await ctx.gameRepo.list({ status: 'FINALIZADA', limit: 2, offset: 2 });
  assert.equal(filtered.total, 4);
  assert.deepEqual(filtered.items.map((i) => i.whitePlayerName), ['g2', 'g1']);
});

// ---------------------------------------------------------------- MoveRepository

test('MoveRepository.create persists every column; FK and size constraints are enforced', async () => {
  const g = await ctx.gameRepo.create(baseGame());
  const m = await ctx.moveRepo.create(baseMove(g.id, { evalScore: 0.25, timeSpentMs: 812 }));
  assert.equal(m.gameId, g.id);
  assert.equal(m.moveNumber, 1);
  assert.equal(m.color, 'WHITE');
  assert.equal(m.san, 'e4');
  assert.equal(m.evalScore, 0.25);
  assert.equal(m.timeSpentMs, 812);
  assert.ok(m.createdAt instanceof Date);
  const plain = await ctx.moveRepo.create(baseMove(g.id, { color: 'BLACK', san: 'e5' }));
  assert.equal(plain.evalScore, null);
  assert.equal(plain.timeSpentMs, null);

  await assert.rejects(ctx.moveRepo.create(baseMove(randomUUID())), /foreign key/);
  await assert.rejects(ctx.moveRepo.create(baseMove(g.id, { san: 'x'.repeat(11) })), /too long/);
  assert.equal(await countRows('moves'), 2);
});

test('MoveRepository.findByGameId: ordered by creation; ties inside one transaction fall back to move_number/color', async () => {
  const g = await ctx.gameRepo.create(baseGame());
  const other = await ctx.gameRepo.create(baseGame());
  // One transaction => identical created_at; inserted deliberately out of order.
  await ctx.withTransaction(async (tx) => {
    for (const [n, c, san] of [[2, 'WHITE', 'Nf3'], [1, 'BLACK', 'e5'], [2, 'BLACK', 'Nc6'], [1, 'WHITE', 'e4']]) {
      await ctx.moveRepo.create(baseMove(g.id, { moveNumber: n, color: c, san }), tx);
    }
    await ctx.moveRepo.create(baseMove(other.id), tx);
  });
  const moves = await ctx.moveRepo.findByGameId(g.id);
  assert.deepEqual(moves.map((m) => m.san), ['e4', 'e5', 'Nf3', 'Nc6']);
  assert.equal((await ctx.moveRepo.findByGameId(other.id)).length, 1);
  assert.deepEqual(await ctx.moveRepo.findByGameId(randomUUID()), []);

  // Separate transactions: created_at follows insertion order.
  const g2 = await ctx.gameRepo.create(baseGame());
  for (const [n, c, san] of [[1, 'WHITE', 'd4'], [1, 'BLACK', 'd5'], [2, 'WHITE', 'c4']]) {
    await ctx.moveRepo.create(baseMove(g2.id, { moveNumber: n, color: c, san }));
  }
  assert.deepEqual((await ctx.moveRepo.findByGameId(g2.id)).map((m) => m.san), ['d4', 'd5', 'c4']);
});

test('MoveRepository.findTrainingMoves (D-08): only moves of FINALIZADA games, with the game result', async () => {
  const mk = async (status, result, sans) => {
    const g = await ctx.gameRepo.create(baseGame({ status, result }));
    for (const [i, san] of sans.entries()) {
      await ctx.moveRepo.create(baseMove(g.id, { moveNumber: Math.floor(i / 2) + 1, color: i % 2 ? 'BLACK' : 'WHITE', san }));
    }
    return g;
  };
  await mk('EN_PROGRESO', undefined, ['a3', 'a6']);
  await mk('PENDIENTE', undefined, ['b3']);
  await mk('FINALIZADA', '1-0', ['e4', 'e5', 'Nf3']);
  await mk('FINALIZADA', '1/2-1/2', ['d4']);

  const training = await ctx.moveRepo.findTrainingMoves();
  assert.equal(training.length, 4);
  assert.deepEqual(training.map((t) => t.san).sort(), ['Nf3', 'd4', 'e4', 'e5']);
  assert.ok(training.every((t) => ['1-0', '1/2-1/2'].includes(t.result)));
  assert.ok(training.every((t) => t.fenBefore === START_FEN));
  const e4 = training.find((t) => t.san === 'e4');
  assert.deepEqual(Object.keys(e4).sort(), ['fenBefore', 'result', 'san']);
});

test('MoveRepository: deleting a game cascades to its moves', async () => {
  const g = await ctx.gameRepo.create(baseGame());
  await ctx.moveRepo.create(baseMove(g.id));
  await ctx.query('DELETE FROM games WHERE id = $1', [g.id]);
  assert.equal(await countRows('moves'), 0);
});

// ---------------------------------------------------------------- withTransaction

test('withTransaction: commit persists, a thrown error rolls everything back', async () => {
  const committed = await ctx.withTransaction(async (tx) => {
    const g = await ctx.gameRepo.create(baseGame(), tx);
    await ctx.moveRepo.create(baseMove(g.id), tx);
    return g;
  });
  assert.equal(await countRows('games'), 1);
  assert.equal(await countRows('moves'), 1);

  await assert.rejects(
    ctx.withTransaction(async (tx) => {
      const g = await ctx.gameRepo.create(baseGame(), tx);
      await ctx.moveRepo.create(baseMove(g.id), tx);
      await ctx.gameRepo.updateFen(committed.id, 'changed', tx);
      throw new Error('boom');
    }),
    /boom/,
  );
  assert.equal(await countRows('games'), 1);
  assert.equal(await countRows('moves'), 1);
  assert.equal((await ctx.gameRepo.findById(committed.id)).currentFen, START_FEN);
});

test('withTransaction: a DB error mid-way (FK violation) rolls back earlier statements and frees the connection', async () => {
  await assert.rejects(
    ctx.withTransaction(async (tx) => {
      await ctx.gameRepo.create(baseGame(), tx);
      await ctx.moveRepo.create(baseMove(randomUUID()), tx);
    }),
    /foreign key/,
  );
  assert.equal(await countRows('games'), 0);
  // Many failing transactions must not leak pool clients.
  for (let i = 0; i < 25; i++) {
    await assert.rejects(ctx.withTransaction(async () => { throw new Error('x'); }), /x/);
  }
  assert.equal(await countRows('games'), 0);
  assert.equal(ctx.pool.idleCount, ctx.pool.totalCount);
});

test('PgnService.importarLote is all-or-nothing in the real DB', async () => {
  const good = '[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0';
  const illegal = '[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 2. Ke4 1-0';
  await assert.rejects(ctx.pgnService.importarLote([good, illegal]), (e) => e.code === 'INVALID_PGN');
  assert.equal(await countRows('games'), 0);
  assert.deepEqual(await ctx.pgnService.importarLote([good, good]), { imported: 2, skipped: 0 });
  assert.equal(await ctx.scalar(`SELECT COUNT(*) FROM games WHERE source='SEED' AND status='FINALIZADA'`), 2);
  assert.equal(await countRows('moves'), 14);
});

// ---------------------------------------------------------------- API over the real database

const mv = (from, to, promotion) => ({ from, to, ...(promotion ? { promotion } : {}) });

test('API: local game played to checkmate persists every ply and finishes the game', async () => {
  const create = await request(ctx.app).post('/games').send({ mode: 'LOCAL', alias: 'Ana' });
  assert.equal(create.status, 201);
  const id = create.body.id;
  assert.equal(create.body.status, 'EN_PROGRESO');

  const plies = [mv('f2', 'f3'), mv('e7', 'e5'), mv('g2', 'g4'), mv('d8', 'h4')]; // fool's mate
  let last;
  for (const p of plies) {
    last = await request(ctx.app).post(`/games/${id}/moves`).send(p);
    assert.equal(last.status, 200);
  }
  assert.equal(last.body.status, 'FINALIZADA');
  assert.equal(last.body.result, '0-1');
  assert.equal(last.body.endReason, 'CHECKMATE');
  assert.equal(ctx.registry.get(id), undefined); // session released

  const row = (await ctx.query('SELECT * FROM games WHERE id = $1', [id])).rows[0];
  assert.equal(row.status, 'FINALIZADA');
  assert.equal(row.result, '0-1');
  assert.ok(row.ended_at);
  assert.equal(row.current_fen, last.body.fen);

  const detail = await request(ctx.app).get(`/games/${id}`);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.moves.map((m) => [m.moveNumber, m.color, m.san]), [
    [1, 'WHITE', 'f3'],
    [1, 'BLACK', 'e5'],
    [2, 'WHITE', 'g4'],
    [2, 'BLACK', 'Qh4#'],
  ]);
  assert.equal(detail.body.moves.at(-1).fenAfter, row.current_fen);

  const after = await request(ctx.app).post(`/games/${id}/moves`).send(mv('a2', 'a3'));
  assert.equal(after.status, 409);
  assert.equal(after.body.error.code, 'GAME_NOT_ACTIVE');
  assert.equal(await countRows('moves'), 4);

  const pgn = await request(ctx.app).get(`/games/${id}/pgn`);
  assert.equal(pgn.status, 200);
  assert.match(pgn.text, /1\. f3 e5 2\. g4 Qh4#/);
  assert.match(pgn.text, /\[Result "0-1"\]/);
});

test('API: an illegal move persists nothing (no move row, FEN unchanged)', async () => {
  const { body } = await request(ctx.app).post('/games').send({ mode: 'LOCAL', alias: 'Ana' });
  const bad = await request(ctx.app).post(`/games/${body.id}/moves`).send(mv('e2', 'e5'));
  assert.equal(bad.status, 422);
  assert.equal(bad.body.error.code, 'ILLEGAL_MOVE');
  assert.equal(await countRows('moves'), 0);
  assert.equal((await ctx.gameRepo.findById(body.id)).currentFen, START_FEN);

  const wrongTurn = await request(ctx.app).post(`/games/${body.id}/moves`).send(mv('e7', 'e5'));
  assert.equal(wrongTurn.status, 422);
  assert.equal(await countRows('moves'), 0);

  const ok = await request(ctx.app).post(`/games/${body.id}/moves`).send(mv('e2', 'e4'));
  assert.equal(ok.status, 200);
  assert.equal(await countRows('moves'), 1);
});

test('API: PGN import (valid, pending, invalid) against the real DB', async () => {
  const valid = '[Event "x"]\n[White "Ana"]\n[Black "Bo"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0';
  const res = await request(ctx.app).post('/games/import').send({ pgn: valid });
  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'FINALIZADA');
  assert.equal(res.body.result, '1-0');
  assert.equal(res.body.source, 'USER');
  assert.equal(res.body.moveCount, 7);
  assert.equal(await countRows('moves'), 7);
  const detail = await request(ctx.app).get(`/games/${res.body.id}`);
  assert.equal(detail.body.whitePlayerName, 'Ana');
  assert.deepEqual(detail.body.moves.map((m) => m.san), ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#']);
  assert.deepEqual(detail.body.moves.map((m) => m.moveNumber), [1, 1, 2, 2, 3, 3, 4]);

  // Unfinished PGN is imported as PENDIENTE and can be resumed and continued.
  const pending = await request(ctx.app).post('/games/import').send({ pgn: '1. e4 e5 2. Nf3 *' });
  assert.equal(pending.status, 201);
  assert.equal(pending.body.status, 'PENDIENTE');
  const resumed = await request(ctx.app).post(`/games/${pending.body.id}/resume`);
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.status, 'EN_PROGRESO');
  const next = await request(ctx.app).post(`/games/${pending.body.id}/moves`).send(mv('b8', 'c6'));
  assert.equal(next.status, 200);
  assert.equal(await ctx.scalar(`SELECT COUNT(*) FROM moves WHERE game_id = $1`, [pending.body.id]), 4);

  const gamesBefore = await countRows('games');
  const movesBefore = await countRows('moves');
  for (const pgn of ['1. e4 e5 2. Ke4 1-0', 'not a pgn at all', '[White "x"]\n\n']) {
    const bad = await request(ctx.app).post('/games/import').send({ pgn });
    assert.equal(bad.status, 422, pgn);
    assert.equal(bad.body.error.code, 'INVALID_PGN');
  }
  assert.equal(await countRows('games'), gamesBefore);
  assert.equal(await countRows('moves'), movesBefore);
});

test('API: history list + filters over the real DB', async () => {
  await seedHistory();
  const list = await request(ctx.app).get('/games?status=FINALIZADA&limit=2&offset=1');
  assert.equal(list.status, 200);
  assert.equal(list.body.total, 4);
  assert.deepEqual(list.body.items.map((i) => i.whitePlayerName), ['g4', 'g2']);
  const empty = await request(ctx.app).get('/games?mode=AI&status=FINALIZADA');
  assert.equal(empty.body.emptyReason, 'NO_MATCHES');
});

test('API: pause, simulated restart, recovery and resume keep position and turn', async () => {
  const a = (await request(ctx.app).post('/games').send({ mode: 'LOCAL', alias: 'Ana' })).body.id;
  const b = (await request(ctx.app).post('/games').send({ mode: 'LOCAL', alias: 'Bo' })).body.id;
  for (const id of [a, b]) {
    await request(ctx.app).post(`/games/${id}/moves`).send(mv('e2', 'e4'));
    await request(ctx.app).post(`/games/${id}/moves`).send(mv('e7', 'e5'));
    await request(ctx.app).post(`/games/${id}/moves`).send(mv('g1', 'f3'));
  }
  const paused = await request(ctx.app).post(`/games/${a}/pause`);
  assert.equal(paused.body.status, 'PENDIENTE');
  const storedB = (await ctx.gameRepo.findById(b)).currentFen;

  await ctx.restart();
  assert.equal(ctx.registry.get(b), undefined);
  assert.equal(await ctx.gestor.recuperarPartidasHuerfanas(), 1); // b was EN_PROGRESO
  assert.equal((await ctx.gameRepo.findById(b)).status, 'PENDIENTE');

  for (const id of [a, b]) {
    const res = await request(ctx.app).post(`/games/${id}/resume`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'EN_PROGRESO');
    assert.equal(res.body.turn, 'BLACK');
    const move = await request(ctx.app).post(`/games/${id}/moves`).send(mv('b8', 'c6'));
    assert.equal(move.status, 200);
  }
  assert.equal((await ctx.gameRepo.findById(b)).currentFen.split(' ')[0] !== storedB.split(' ')[0], true);
  assert.equal(await ctx.scalar(`SELECT COUNT(*) FROM moves WHERE game_id = $1`, [b]), 4);
});
