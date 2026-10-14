import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createTestContext } from '../fakes/index.js';

function setup() {
  const ctx = createTestContext();
  const app = createApp({
    frontendUrl: 'http://localhost:5173',
    checkDb: async () => true,
    gestor: ctx.gestor,
    historial: ctx.historial,
    pgnService: ctx.pgnService,
    difficultyService: ctx.difficultyService,
  });
  return { ...ctx, app };
}

const importPgn = (app, pgn) => request(app).post('/games/import').send({ pgn });

const SCHOLAR = `[Event "Casual"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`;

test('valid PGN creates the game and all moves in one go', async () => {
  const { app, store } = setup();
  const res = await importPgn(app, SCHOLAR);
  assert.equal(res.status, 201);
  assert.equal(res.body.moveCount, 7);
  assert.equal(res.body.status, 'FINALIZADA');
  assert.equal(res.body.result, '1-0');
  assert.equal(res.body.mode, 'LOCAL');
  assert.equal(res.body.whitePlayerName, 'Alice');
  assert.equal(res.body.blackPlayerName, 'Bob');
  assert.equal(res.body.source, 'USER');

  const game = store.games[0];
  assert.equal(game.whiteType, 'HUMAN');
  assert.equal(game.blackType, 'HUMAN');
  assert.ok(game.endedAt);
  assert.equal(store.moves.length, 7);
  const first = store.moves[0];
  assert.deepEqual(
    [first.moveNumber, first.color, first.san],
    [1, 'WHITE', 'e4'],
  );
  assert.equal(store.moves[1].fenBefore, first.fenAfter);
  assert.deepEqual(store.moves.map((m) => m.moveNumber), [1, 1, 2, 2, 3, 3, 4]);
  assert.equal(game.currentFen, store.moves.at(-1).fenAfter);
});

test('names default to Unknown when tags are missing or "?"', async () => {
  const { app } = setup();
  const res = await importPgn(app, '[Event "x"]\n[White "?"]\n\n1. e4 e5 *');
  assert.equal(res.status, 201);
  assert.equal(res.body.whitePlayerName, 'Unknown');
  assert.equal(res.body.blackPlayerName, 'Unknown');
  const bare = await importPgn(app, '1. d4 d5 *');
  assert.equal(bare.status, 201);
  assert.equal(bare.body.whitePlayerName, 'Unknown');
});

test('result tag mapping: 1-0, 0-1, 1/2-1/2 finish; * and missing stay PENDIENTE', async () => {
  const { app } = setup();
  const cases = [
    ['1-0', 'FINALIZADA', '1-0'],
    ['0-1', 'FINALIZADA', '0-1'],
    ['1/2-1/2', 'FINALIZADA', '1/2-1/2'],
    ['*', 'PENDIENTE', null],
  ];
  for (const [tag, status, result] of cases) {
    const res = await importPgn(app, `[Result "${tag}"]\n\n1. e4 e5 2. Nf3 ${tag}`);
    assert.equal(res.status, 201, tag);
    assert.equal(res.body.status, status, tag);
    assert.equal(res.body.result, result, tag);
  }
  const noTag = await importPgn(app, '1. e4 e5 2. Nf3');
  assert.equal(noTag.body.status, 'PENDIENTE');
  assert.equal(noTag.body.result, null);
});

test('a terminal position finishes the game even when the Result tag says "*"', async () => {
  const { app } = setup();
  const res = await importPgn(app, '[Result "*"]\n\n1. f3 e5 2. g4 Qh4#');
  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'FINALIZADA');
  assert.equal(res.body.result, '0-1');
});

test('an unfinished imported game can be resumed and played on', async () => {
  const { app } = setup();
  const res = await importPgn(app, '1. e4 e5 2. Nf3 *');
  assert.equal(res.body.status, 'PENDIENTE');
  assert.equal(res.body.turn, 'BLACK');
  const resumed = await request(app).post(`/games/${res.body.id}/resume`);
  assert.equal(resumed.status, 200);
  const move = await request(app).post(`/games/${res.body.id}/moves`).send({ from: 'b8', to: 'c6' });
  assert.equal(move.status, 200);
});

test('invalid PGN returns 422 INVALID_PGN and persists nothing', async () => {
  const { app, store } = setup();
  const bad = [
    'this is not chess at all',
    '[Event "x"]\n\n1. e4 e5 2. Ke5 *', // illegal move
    '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxe8 *', // illegal move late in the game
    '[Event "x"]\n\n*', // no moves
    '[SetUp "1"]\n[FEN "8/8/8/8/8/8/8/K6k w - - 0 1"]\n\n1. Ka2 Kg2 *', // custom start position
  ];
  for (const pgn of bad) {
    const res = await importPgn(app, pgn);
    assert.equal(res.status, 422, pgn);
    assert.equal(res.body.error.code, 'INVALID_PGN');
    assert.match(res.body.error.message, /Invalid PGN/);
  }
  assert.equal(store.games.length, 0);
  assert.equal(store.moves.length, 0);
});

test('body validation: missing / non-string / oversize pgn', async () => {
  const { app, store } = setup();
  assert.equal((await request(app).post('/games/import').send({})).status, 400);
  assert.equal((await request(app).post('/games/import').send({ pgn: 5 })).status, 400);
  assert.equal((await importPgn(app, '')).status, 400);
  const tooBig = await importPgn(app, `1. e4 e5 ${' '.repeat(200_001)}*`);
  assert.equal(tooBig.status, 400);
  const huge = await importPgn(app, 'x'.repeat(400_000));
  assert.equal(huge.status, 413);
  assert.equal(store.games.length, 0);
});

test('a failure while writing moves rolls the whole import back', async () => {
  const { app, store, moveRepo } = setup();
  const original = moveRepo.create.bind(moveRepo);
  let calls = 0;
  moveRepo.create = async (...args) => {
    if (++calls === 3) throw new Error('db down');
    return original(...args);
  };
  const res = await importPgn(app, SCHOLAR);
  assert.equal(res.status, 500);
  assert.equal(store.games.length, 0);
  assert.equal(store.moves.length, 0);
});
