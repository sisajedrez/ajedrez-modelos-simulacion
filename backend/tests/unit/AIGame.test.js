import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { FakeAIServer, closedPortUrl } from '../fakes/FakeAIServer.js';
import { createFakeEngine, createTestContext } from '../fakes/index.js';

const mv = (from, to, promotion) => ({ from, to, promotion });
const aiBody = (extra = {}) => ({ mode: 'AI', alias: 'Ana', difficulty: 'MEDIO', ...extra });
let server;
before(async () => {
  server = await new FakeAIServer().start();
});
after(() => server.stop());

function setup({ url = server.url } = {}) {
  const engine = createFakeEngine();
  const ctx = createTestContext({ engine, aiUrl: url });
  const app = createApp({
    frontendUrl: 'http://localhost:5173',
    checkDb: async () => true,
    gestor: ctx.gestor,
    difficultyService: ctx.difficultyService,
  });
  return { ...ctx, engine, app };
}

test('AI as white: names/types, human move, then engine-move with engineSource', async () => {
  server.behavior = 'history';
  const { gestor, store, engine } = setup();
  const game = await gestor.crearPartida(aiBody());
  assert.equal(game.blackPlayerName, 'AI');
  assert.equal(store.games[0].blackType, 'AI');
  assert.equal(store.games[0].whiteType, 'HUMAN');
  assert.equal(game.mode, 'AI');

  server.requests.length = 0;
  await gestor.realizarJugada(game.id, mv('e2', 'e4'));
  const res = await gestor.jugarTurnoMaquina(game.id);
  assert.equal(res.engineSource, 'history');
  assert.equal(res.valid, true);
  assert.equal(store.moves.length, 2);
  assert.equal(store.moves[1].color, 'BLACK');
  assert.equal(server.requests[0].body.difficulty, 'MEDIO');
  assert.equal(server.requests[0].body.elo, null);
  assert.equal(engine.created.length, 0); // no Stockfish spawned while the AI answers
});

test('AI as black: the opening move is played at creation', async () => {
  server.behavior = 'openings';
  const { gestor, store } = setup();
  const game = await gestor.crearPartida(aiBody({ playerColor: 'BLACK' }));
  assert.equal(game.whitePlayerName, 'AI');
  assert.equal(store.games[0].whiteType, 'AI');
  assert.equal(game.turn, 'BLACK');
  assert.equal(game.engineError, undefined);
  assert.equal(store.moves.length, 1);
  assert.equal((await gestor.realizarJugada(game.id, mv('a7', 'a6'))).valid, true);
});

test('AI service down: the game continues through the Stockfish fallback', async () => {
  const { gestor, store, engine, warnings } = setup({ url: await closedPortUrl() });
  const game = await gestor.crearPartida(aiBody());
  await gestor.realizarJugada(game.id, mv('e2', 'e4'));
  const res = await gestor.jugarTurnoMaquina(game.id);
  assert.equal(res.engineSource, 'fallback');
  assert.equal(engine.created[0].skillLevel, 0);
  assert.equal(store.moves.length, 2);
  assert.equal(warnings.length, 1);
});

test('AI not configured (no URL): fallback too', async () => {
  const { gestor } = setup({ url: undefined });
  const game = await gestor.crearPartida(aiBody({ playerColor: 'BLACK' }));
  assert.equal(game.turn, 'BLACK');
  assert.equal(game.engineError, undefined);
});

test('AI requires a difficulty; turn guards work like STOCKFISH', async () => {
  server.behavior = 'history';
  const { gestor } = setup();
  await assert.rejects(gestor.crearPartida({ mode: 'AI', alias: 'Ana' }), { code: 'VALIDATION_ERROR' });
  const game = await gestor.crearPartida(aiBody());
  await assert.rejects(gestor.jugarTurnoMaquina(game.id), { code: 'NOT_ENGINE_TURN', status: 409 });
  await gestor.realizarJugada(game.id, mv('e2', 'e4'));
  await assert.rejects(gestor.realizarJugada(game.id, mv('e7', 'e5')), { code: 'NOT_YOUR_TURN' });
});

test('the AI session is rebuilt with the profile difficulty after a registry reset', async () => {
  server.behavior = 'history';
  const { gestor, registry } = setup();
  const game = await gestor.crearPartida(aiBody({ difficulty: 'DIFICIL' }));
  await gestor.realizarJugada(game.id, mv('e2', 'e4'));
  registry.clear();
  server.requests.length = 0;
  const res = await gestor.jugarTurnoMaquina(game.id);
  assert.equal(res.engineSource, 'history');
  assert.equal(server.requests[0].body.difficulty, 'DIFICIL');
});

test('API: AI game create + engine-move expose engineSource', async () => {
  server.behavior = 'history';
  const { app } = setup();
  const created = await request(app).post('/games').send(aiBody());
  assert.equal(created.status, 201);
  assert.equal(created.body.blackType, 'AI');
  await request(app).post(`/games/${created.body.id}/moves`).send({ from: 'e2', to: 'e4' });
  const res = await request(app).post(`/games/${created.body.id}/engine-move`);
  assert.equal(res.status, 200);
  assert.equal(res.body.engineSource, 'history');
});

test('STOCKFISH engine moves report engineSource "stockfish"', async () => {
  const { gestor } = setup();
  const game = await gestor.crearPartida({ mode: 'STOCKFISH', alias: 'Ana', difficulty: 'FACIL' });
  await gestor.realizarJugada(game.id, mv('e2', 'e4'));
  assert.equal((await gestor.jugarTurnoMaquina(game.id)).engineSource, 'stockfish');
});

test('resigning an AI game disposes the fallback engine', async () => {
  server.behavior = 'none';
  const { gestor, engine } = setup();
  const game = await gestor.crearPartida(aiBody());
  await gestor.realizarJugada(game.id, mv('e2', 'e4'));
  await gestor.jugarTurnoMaquina(game.id);
  await gestor.rendirse(game.id);
  assert.equal(engine.created[0].disposed, 1);
});
