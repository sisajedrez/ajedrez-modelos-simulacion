import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createTestContext } from '../fakes/index.js';

function setup() {
  const ctx = createTestContext();
  const app = createApp({
    frontendUrl: 'http://localhost:5173',
    checkDb: async () => true,
    gestor: ctx.gestor,
    difficultyService: ctx.difficultyService,
  });
  return { ...ctx, app };
}

const createLocal = (app, body = {}) =>
  request(app).post('/games').send({ mode: 'LOCAL', alias: 'Ana', ...body });

test("fool's mate through the API finishes the game with 4 move rows", async () => {
  const { app, store } = setup();
  const created = await createLocal(app);
  assert.equal(created.status, 201);
  const id = created.body.id;

  const moves = [
    ['f2', 'f3'],
    ['e7', 'e5'],
    ['g2', 'g4'],
    ['d8', 'h4'],
  ];
  let last;
  for (const [from, to] of moves) {
    last = await request(app).post(`/games/${id}/moves`).send({ from, to });
    assert.equal(last.status, 200);
  }
  assert.equal(last.body.valid, true);
  assert.equal(last.body.status, 'FINALIZADA');
  assert.equal(last.body.result, '0-1');
  assert.equal(last.body.endReason, 'CHECKMATE');
  assert.equal(store.moves.length, 4);
  assert.equal(store.games[0].status, 'FINALIZADA');

  const after = await request(app).post(`/games/${id}/moves`).send({ from: 'a2', to: 'a3' });
  assert.equal(after.status, 409);
  assert.equal(after.body.error.code, 'GAME_NOT_ACTIVE');
});

test('legal-moves lists the moves for a square', async () => {
  const { app } = setup();
  const { body } = await createLocal(app);
  const res = await request(app).get(`/games/${body.id}/legal-moves`).query({ square: 'e2' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.moves.map((m) => m.to).sort(), ['e3', 'e4']);
});

test('an illegal move returns 422 ILLEGAL_MOVE', async () => {
  const { app, store } = setup();
  const { body } = await createLocal(app);
  const res = await request(app).post(`/games/${body.id}/moves`).send({ from: 'e2', to: 'e5' });
  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'ILLEGAL_MOVE');
  assert.equal(res.body.error.retryable, false);
  assert.equal(store.moves.length, 0);
});

test('resign finishes the game', async () => {
  const { app } = setup();
  const { body } = await createLocal(app);
  const res = await request(app).post(`/games/${body.id}/resign`).send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.result, '0-1');
  assert.equal(res.body.endReason, 'RESIGNATION');
  const again = await request(app).post(`/games/${body.id}/resign`);
  assert.equal(again.status, 409);
});

test('POST /games validation errors return 400', async () => {
  const { app } = setup();
  const bad = [
    {},
    { mode: 'LOCAL' },
    { mode: 'LOCAL', alias: '   ' },
    { mode: 'LOCAL', alias: 'x'.repeat(101) },
    { mode: 'CHESS960', alias: 'Ana' },
    { mode: 'LOCAL', alias: 'Ana', playerColor: 'RED' },
    { mode: 'LOCAL', alias: 'Ana', difficulty: 'IMPOSIBLE' },
    { mode: 'STOCKFISH', alias: 'Ana' },
  ];
  for (const payload of bad) {
    const res = await request(app).post('/games').send(payload);
    assert.equal(res.status, 400, JSON.stringify(payload));
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.equal(typeof res.body.error.message, 'string');
  }
});

test('move validation errors return 400', async () => {
  const { app } = setup();
  const { body } = await createLocal(app);
  const url = `/games/${body.id}/moves`;
  for (const payload of [
    {},
    { from: 'e2' },
    { from: 'e9', to: 'e4' },
    { from: 'E2', to: 'e4' },
    { from: 'e2', to: 'e4', promotion: 'k' },
  ]) {
    const res = await request(app).post(url).send(payload);
    assert.equal(res.status, 400, JSON.stringify(payload));
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  }
  const badId = await request(app).post('/games/not-a-uuid/moves').send({ from: 'e2', to: 'e4' });
  assert.equal(badId.status, 400);
  const badSquare = await request(app).get(`/games/${body.id}/legal-moves`).query({ square: 'z9' });
  assert.equal(badSquare.status, 400);
  const noSquare = await request(app).get(`/games/${body.id}/legal-moves`);
  assert.equal(noSquare.status, 400);
});

test('unknown game id returns 404 GAME_NOT_FOUND', async () => {
  const { app } = setup();
  const id = randomUUID();
  const move = await request(app).post(`/games/${id}/moves`).send({ from: 'e2', to: 'e4' });
  assert.equal(move.status, 404);
  assert.equal(move.body.error.code, 'GAME_NOT_FOUND');
  assert.equal((await request(app).get(`/games/${id}/legal-moves?square=e2`)).status, 404);
  assert.equal((await request(app).post(`/games/${id}/resign`)).status, 404);
});

test('STOCKFISH and AI modes return 501 MODE_NOT_AVAILABLE', async () => {
  const { app, store } = setup();
  for (const mode of ['STOCKFISH', 'AI']) {
    const res = await request(app).post('/games').send({ mode, alias: 'Ana', difficulty: 'FACIL' });
    assert.equal(res.status, 501);
    assert.equal(res.body.error.code, 'MODE_NOT_AVAILABLE');
  }
  assert.equal(store.games.length, 0);
});

test('GET /difficulty-profiles returns FACIL, MEDIO and DIFICIL', async () => {
  const { app } = setup();
  const res = await request(app).get('/difficulty-profiles');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((p) => p.name).sort(), ['DIFICIL', 'FACIL', 'MEDIO']);
});
