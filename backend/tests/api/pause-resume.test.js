import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createFakeEngine, createTestContext } from '../fakes/index.js';

function setup() {
  const engine = createFakeEngine();
  const ctx = createTestContext({ engine });
  const app = createApp({
    frontendUrl: 'http://localhost:5173',
    checkDb: async () => true,
    gestor: ctx.gestor,
    historial: ctx.historial,
    pgnService: ctx.pgnService,
    difficultyService: ctx.difficultyService,
  });
  return { ...ctx, engine, app };
}

const mv = (from, to) => ({ from, to });
const sfBody = (extra = {}) => ({ mode: 'STOCKFISH', alias: 'Ana', difficulty: 'MEDIO', ...extra });

test('LOCAL: pause -> PENDIENTE, session removed; moves are rejected with 409', async () => {
  const { app, gestor, registry, store } = setup();
  const { id } = await gestor.crearPartida({ mode: 'LOCAL', alias: 'Ana' });
  await gestor.realizarJugada(id, mv('e2', 'e4'));
  assert.ok(registry.get(id));

  const res = await request(app).post(`/games/${id}/pause`);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'PENDIENTE');
  assert.equal(registry.get(id), undefined);
  assert.equal(store.games[0].status, 'PENDIENTE');

  const move = await request(app).post(`/games/${id}/moves`).send(mv('e7', 'e5'));
  assert.equal(move.status, 409);
  assert.equal(move.body.error.code, 'GAME_NOT_ACTIVE');
  assert.equal(store.moves.length, 1);
});

test('pause errors: unknown game 404, already paused / finished 409 GAME_NOT_ACTIVE', async () => {
  const { app, gestor } = setup();
  assert.equal((await request(app).post(`/games/${randomUUID()}/pause`)).status, 404);
  const { id } = await gestor.crearPartida({ mode: 'LOCAL', alias: 'Ana' });
  await request(app).post(`/games/${id}/pause`);
  const again = await request(app).post(`/games/${id}/pause`);
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'GAME_NOT_ACTIVE');

  const other = await gestor.crearPartida({ mode: 'LOCAL', alias: 'Bo' });
  await gestor.rendirse(other.id);
  const finished = await request(app).post(`/games/${other.id}/pause`);
  assert.equal(finished.status, 409);
  assert.equal(finished.body.error.code, 'GAME_NOT_ACTIVE');
});

test('STOCKFISH: pause disposes the engine and frees the registry', async () => {
  const { app, gestor, registry, engine } = setup();
  const { id } = await gestor.crearPartida(sfBody());
  assert.equal(engine.created.length, 1);
  assert.equal(engine.created[0].disposed, 0);

  const res = await request(app).post(`/games/${id}/pause`);
  assert.equal(res.status, 200);
  assert.equal(engine.created[0].disposed, 1);
  assert.equal(registry.get(id), undefined);

  const engineMove = await request(app).post(`/games/${id}/engine-move`);
  assert.equal(engineMove.status, 409);
  assert.equal(engineMove.body.error.code, 'GAME_NOT_ACTIVE');
});

test('resume errors: unknown game 404; EN_PROGRESO and FINALIZADA -> 409 GAME_NOT_PENDING', async () => {
  const { app, gestor } = setup();
  assert.equal((await request(app).post(`/games/${randomUUID()}/resume`)).status, 404);

  const active = await gestor.crearPartida({ mode: 'LOCAL', alias: 'Ana' });
  const r1 = await request(app).post(`/games/${active.id}/resume`);
  assert.equal(r1.status, 409);
  assert.equal(r1.body.error.code, 'GAME_NOT_PENDING');

  await gestor.rendirse(active.id);
  const r2 = await request(app).post(`/games/${active.id}/resume`);
  assert.equal(r2.status, 409);
  assert.equal(r2.body.error.code, 'GAME_NOT_PENDING');
});

test('LOCAL: resume restores FEN and turn, and play continues', async () => {
  const { app, gestor, registry } = setup();
  const { id } = await gestor.crearPartida({ mode: 'LOCAL', alias: 'Ana' });
  const played = await gestor.realizarJugada(id, mv('e2', 'e4'));
  await gestor.pausarPartida(id);

  const res = await request(app).post(`/games/${id}/resume`);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'EN_PROGRESO');
  assert.equal(res.body.fen, played.fen);
  assert.equal(res.body.turn, 'BLACK');
  assert.ok(registry.get(id));

  const next = await request(app).post(`/games/${id}/moves`).send(mv('e7', 'e5'));
  assert.equal(next.status, 200);
  assert.equal(next.body.san, 'e5');
});

test('STOCKFISH: resume recreates the engine with the profile skill and does not auto-move', async () => {
  const { app, gestor, engine, store } = setup();
  const { id } = await gestor.crearPartida(sfBody({ difficulty: 'DIFICIL' }));
  await gestor.realizarJugada(id, mv('e2', 'e4')); // now it is the engine's turn
  await gestor.pausarPartida(id);
  const movesBefore = store.moves.length;

  const res = await request(app).post(`/games/${id}/resume`);
  assert.equal(res.status, 200);
  assert.equal(res.body.turn, 'BLACK');
  assert.equal(engine.created.length, 2);
  assert.equal(engine.created[1].skillLevel, 20);
  assert.equal(engine.created[1].fens.length, 0);
  assert.equal(store.moves.length, movesBefore);

  engine.script.push(mv('e7', 'e5'));
  const em = await request(app).post(`/games/${id}/engine-move`);
  assert.equal(em.status, 200);
  assert.equal(em.body.san, 'e5');
});

test('full scenario: pause, simulated restart (registry cleared), resume, continue from the same FEN', async () => {
  const { app, gestor, registry, engine, store } = setup();
  const { id } = await gestor.crearPartida(sfBody());
  await gestor.realizarJugada(id, mv('e2', 'e4'));
  engine.script.push(mv('e7', 'e5'));
  await gestor.jugarTurnoMaquina(id);
  await gestor.realizarJugada(id, mv('g1', 'f3'));
  const fenBeforePause = store.games[0].currentFen;

  assert.equal((await request(app).post(`/games/${id}/pause`)).status, 200);
  registry.clear(); // process restart: nothing in memory

  const resumed = await request(app).post(`/games/${id}/resume`);
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.fen, fenBeforePause);
  assert.equal(resumed.body.turn, 'BLACK');

  engine.script.push(mv('b8', 'c6'));
  const em = await request(app).post(`/games/${id}/engine-move`);
  assert.equal(em.status, 200);
  assert.equal(em.body.san, 'Nc6');
  const last = engine.created.at(-1);
  assert.equal(last.fens[0], fenBeforePause);
  assert.equal(store.moves.length, 4);
});

test('resume refuses an inconsistent stored position', async () => {
  const { app, gestor, store } = setup();
  const { id } = await gestor.crearPartida({ mode: 'LOCAL', alias: 'Ana' });
  await gestor.realizarJugada(id, mv('e2', 'e4'));
  await gestor.pausarPartida(id);
  store.games[0].currentFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const res = await request(app).post(`/games/${id}/resume`);
  assert.equal(res.status, 500);
  assert.equal(res.body.error.code, 'SESSION_INCONSISTENT');
  assert.equal(store.games[0].status, 'PENDIENTE');
});

test('concurrent pause requests: exactly one succeeds', async () => {
  const { gestor } = setup();
  const { id } = await gestor.crearPartida({ mode: 'LOCAL', alias: 'Ana' });
  const results = await Promise.allSettled([gestor.pausarPartida(id), gestor.pausarPartida(id)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'GAME_NOT_ACTIVE');
});

test('startup recovery marks EN_PROGRESO games PENDIENTE and leaves the rest alone', async () => {
  const { gestor, store } = setup();
  const a = await gestor.crearPartida({ mode: 'LOCAL', alias: 'A' });
  const b = await gestor.crearPartida({ mode: 'LOCAL', alias: 'B' });
  const c = await gestor.crearPartida({ mode: 'LOCAL', alias: 'C' });
  await gestor.rendirse(b.id);
  await gestor.pausarPartida(c.id);

  const count = await gestor.recuperarPartidasHuerfanas();
  assert.equal(count, 1);
  const status = (id) => store.games.find((g) => g.id === id).status;
  assert.equal(status(a.id), 'PENDIENTE');
  assert.equal(status(b.id), 'FINALIZADA');
  assert.equal(status(c.id), 'PENDIENTE');
  assert.equal(await gestor.recuperarPartidasHuerfanas(), 0);
});
