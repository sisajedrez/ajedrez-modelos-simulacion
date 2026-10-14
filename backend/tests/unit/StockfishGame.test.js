import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { AppError } from '../../src/errors/AppError.js';
import { GameSessionFactory } from '../../src/services/GameSessionFactory.js';
import { createFakeEngine, createTestContext } from '../fakes/index.js';

const mv = (from, to, promotion) => ({ from, to, promotion });
const sfBody = (extra = {}) => ({ mode: 'STOCKFISH', alias: 'Ana', difficulty: 'MEDIO', ...extra });

function setup() {
  const engine = createFakeEngine();
  const ctx = createTestContext({ engine });
  const app = createApp({
    frontendUrl: 'http://localhost:5173',
    checkDb: async () => true,
    gestor: ctx.gestor,
    difficultyService: ctx.difficultyService,
  });
  return { ...ctx, engine, app };
}

test('STOCKFISH as white: human move then engine-move persist both', async () => {
  const { gestor, store, engine } = setup();
  const game = await gestor.crearPartida(sfBody());
  assert.equal(game.whitePlayerName, 'Ana');
  assert.equal(game.blackPlayerName, 'Stockfish');
  assert.equal(store.games[0].whiteType, 'HUMAN');
  assert.equal(store.games[0].blackType, 'ENGINE');
  assert.equal(store.games[0].difficultyProfileId, store.profiles.find((p) => p.name === 'MEDIO').id);
  assert.equal(engine.created[0].skillLevel, 10);

  await gestor.realizarJugada(game.id, mv('e2', 'e4'));
  engine.script.push(mv('e7', 'e5'));
  const res = await gestor.jugarTurnoMaquina(game.id);
  assert.equal(res.san, 'e5');
  assert.equal(res.status, 'EN_PROGRESO');
  assert.equal(store.moves.length, 2);
  assert.equal(store.moves[1].color, 'BLACK');
  assert.equal(typeof store.moves[1].timeSpentMs, 'number');
  assert.equal(store.games[0].currentFen, res.fen);
});

test('skill level comes from the profile (FACIL=3, DIFICIL=20)', async () => {
  const { gestor, engine } = setup();
  await gestor.crearPartida(sfBody({ difficulty: 'FACIL' }));
  await gestor.crearPartida(sfBody({ difficulty: 'DIFICIL' }));
  assert.deepEqual(engine.created.map((a) => a.skillLevel), [3, 20]);
});

test('STOCKFISH requires a difficulty', async () => {
  const { gestor, store } = setup();
  await assert.rejects(gestor.crearPartida({ mode: 'STOCKFISH', alias: 'Ana' }), {
    code: 'VALIDATION_ERROR',
    status: 400,
  });
  assert.equal(store.games.length, 0);
});

test('AI mode is 501 when no AI adapter factory is wired', async () => {
  const { gestor } = setup();
  gestor.factory = new GameSessionFactory({ adapterFactory: createFakeEngine().adapterFactory });
  await assert.rejects(gestor.crearPartida({ mode: 'AI', alias: 'Ana', difficulty: 'FACIL' }), {
    code: 'MODE_NOT_AVAILABLE',
    status: 501,
  });
});

test('STOCKFISH as black: the engine white move is already saved at creation', async () => {
  const { gestor, store, engine } = setup();
  engine.script.push(mv('d2', 'd4'));
  const game = await gestor.crearPartida(sfBody({ playerColor: 'BLACK' }));
  assert.equal(game.whitePlayerName, 'Stockfish');
  assert.equal(game.blackPlayerName, 'Ana');
  assert.equal(game.turn, 'BLACK');
  assert.equal(game.engineError, undefined);
  assert.equal(store.moves.length, 1);
  assert.equal(store.moves[0].san, 'd4');
  assert.equal(store.games[0].currentFen, game.fen);

  const res = await gestor.realizarJugada(game.id, mv('d7', 'd5'));
  assert.equal(res.san, 'd5');
});

test('engine failure at creation still returns the game plus engineError, retry via engine-move', async () => {
  const { gestor, store, engine } = setup();
  engine.failWith = new AppError('ENGINE_TIMEOUT', 'timeout', 504, true);
  const game = await gestor.crearPartida(sfBody({ playerColor: 'BLACK' }));
  assert.equal(game.turn, 'WHITE');
  assert.deepEqual(game.engineError, { code: 'ENGINE_TIMEOUT', retryable: true });
  assert.equal(store.moves.length, 0);

  engine.failWith = null;
  engine.script.push(mv('e2', 'e4'));
  const res = await gestor.jugarTurnoMaquina(game.id);
  assert.equal(res.san, 'e4');
  assert.equal(store.moves.length, 1);
});

test('NOT_YOUR_TURN and NOT_ENGINE_TURN return 409', async () => {
  const { gestor, store, engine } = setup();
  const game = await gestor.crearPartida(sfBody());
  await assert.rejects(gestor.jugarTurnoMaquina(game.id), { code: 'NOT_ENGINE_TURN', status: 409 });

  await gestor.realizarJugada(game.id, mv('e2', 'e4'));
  await assert.rejects(gestor.realizarJugada(game.id, mv('e7', 'e5')), {
    code: 'NOT_YOUR_TURN',
    status: 409,
  });
  assert.equal(store.moves.length, 1);
  assert.equal(engine.created[0].fens.length, 0);

  const local = await gestor.crearPartida({ mode: 'LOCAL', alias: 'Ana' });
  await assert.rejects(gestor.jugarTurnoMaquina(local.id), { code: 'NOT_ENGINE_TURN', status: 409 });
});

test('engine-move on unknown / finished games returns 404 / 409', async () => {
  const { gestor } = setup();
  await assert.rejects(gestor.jugarTurnoMaquina('00000000-0000-4000-8000-000000000000'), {
    status: 404,
  });
  const game = await gestor.crearPartida(sfBody());
  await gestor.rendirse(game.id);
  await assert.rejects(gestor.jugarTurnoMaquina(game.id), { code: 'GAME_NOT_ACTIVE', status: 409 });
});

test('an illegal engine move returns 500 ENGINE_ILLEGAL_MOVE and persists nothing', async () => {
  const { gestor, store, engine } = setup();
  const game = await gestor.crearPartida(sfBody());
  await gestor.realizarJugada(game.id, mv('e2', 'e4'));
  engine.script.push(mv('e7', 'e3'));
  await assert.rejects(gestor.jugarTurnoMaquina(game.id), {
    code: 'ENGINE_ILLEGAL_MOVE',
    status: 500,
  });
  assert.equal(store.moves.length, 1);
  engine.script.push(mv('e7', 'e5'));
  assert.equal((await gestor.jugarTurnoMaquina(game.id)).san, 'e5');
});

test('game end (mate) disposes the opponent and removes the session', async () => {
  const { gestor, store, engine, registry } = setup();
  const game = await gestor.crearPartida(sfBody());
  await gestor.realizarJugada(game.id, mv('f2', 'f3'));
  engine.script.push(mv('e7', 'e5'));
  await gestor.jugarTurnoMaquina(game.id);
  await gestor.realizarJugada(game.id, mv('g2', 'g4'));
  engine.script.push(mv('d8', 'h4'));
  const last = await gestor.jugarTurnoMaquina(game.id);
  assert.equal(last.status, 'FINALIZADA');
  assert.equal(last.result, '0-1');
  assert.equal(store.games[0].status, 'FINALIZADA');
  assert.equal(engine.created[0].disposed, 1);
  assert.equal(registry.get(game.id), undefined);
});

test('resign disposes the opponent', async () => {
  const { gestor, engine } = setup();
  const game = await gestor.crearPartida(sfBody());
  await gestor.rendirse(game.id);
  assert.equal(engine.created[0].disposed, 1);
});

test('the engine opponent is rebuilt with the profile skill after a registry reset', async () => {
  const { gestor, registry, engine } = setup();
  const game = await gestor.crearPartida(sfBody({ difficulty: 'DIFICIL' }));
  await gestor.realizarJugada(game.id, mv('e2', 'e4'));
  registry.clear();
  engine.script.push(mv('e7', 'e5'));
  const res = await gestor.jugarTurnoMaquina(game.id);
  assert.equal(res.san, 'e5');
  assert.equal(engine.created.length, 2);
  assert.equal(engine.created[1].skillLevel, 20);
});

test('SessionRegistry.disposeAll disposes every opponent', async () => {
  const { gestor, registry, engine } = setup();
  await gestor.crearPartida(sfBody());
  await gestor.crearPartida(sfBody());
  await registry.disposeAll();
  assert.deepEqual(engine.created.map((a) => a.disposed), [1, 1]);
  assert.equal(registry.get('x'), undefined);
});

test('API: engine timeout returns 504 retryable and the human move stays saved', async () => {
  const { app, store, engine } = setup();
  const created = await request(app).post('/games').send(sfBody());
  assert.equal(created.status, 201);
  const id = created.body.id;
  const m = await request(app).post(`/games/${id}/moves`).send({ from: 'e2', to: 'e4' });
  assert.equal(m.status, 200);

  engine.failWith = new AppError('ENGINE_TIMEOUT', 'Engine did not answer', 504, true);
  const res = await request(app).post(`/games/${id}/engine-move`);
  assert.equal(res.status, 504);
  assert.equal(res.body.error.code, 'ENGINE_TIMEOUT');
  assert.equal(res.body.error.retryable, true);
  assert.equal(store.moves.length, 1);

  engine.failWith = null;
  engine.script.push(mv('c7', 'c5'));
  const ok = await request(app).post(`/games/${id}/engine-move`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.san, 'c5');
  assert.equal(store.moves.length, 2);
});

test('API: engine-move validation and turn errors', async () => {
  const { app } = setup();
  assert.equal((await request(app).post('/games/not-a-uuid/engine-move')).status, 400);
  const created = await request(app).post('/games').send(sfBody());
  const res = await request(app).post(`/games/${created.body.id}/engine-move`);
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'NOT_ENGINE_TURN');
  const move = await request(app).post(`/games/${created.body.id}/moves`).send({ from: 'e2', to: 'e4' });
  assert.equal(move.status, 200);
  const again = await request(app).post(`/games/${created.body.id}/moves`).send({ from: 'e7', to: 'e5' });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'NOT_YOUR_TURN');
});

test('API: black game creation returns 201 with engineError when the engine fails', async () => {
  const { app, engine } = setup();
  engine.failWith = new AppError('ENGINE_UNAVAILABLE', 'down', 503, true);
  const res = await request(app).post('/games').send(sfBody({ playerColor: 'BLACK' }));
  assert.equal(res.status, 201);
  assert.equal(res.body.turn, 'WHITE');
  assert.deepEqual(res.body.engineError, { code: 'ENGINE_UNAVAILABLE', retryable: true });
});
