import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Chess } from 'chess.js';
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

// Plays a short scripted game on a fresh LOCAL game; returns the game id.
async function localGame(gestor, alias, moves = []) {
  const game = await gestor.crearPartida({ mode: 'LOCAL', alias });
  for (const m of moves) await gestor.realizarJugada(game.id, m);
  return game.id;
}

test('empty database -> NO_GAMES with the Spanish message', async () => {
  const { app } = setup();
  const res = await request(app).get('/games');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.items, []);
  assert.equal(res.body.emptyReason, 'NO_GAMES');
  assert.equal(res.body.message, 'No hay partidas registradas');
});

test('filters that match nothing -> NO_MATCHES', async () => {
  const { app, gestor } = setup();
  await localGame(gestor, 'Ana');
  const res = await request(app).get('/games').query({ status: 'FINALIZADA' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.items, []);
  assert.equal(res.body.emptyReason, 'NO_MATCHES');
  assert.equal(res.body.message, 'No se encontraron partidas con los filtros seleccionados');
});

test('non-empty list has no emptyReason and items carry the documented fields', async () => {
  const { app, gestor } = setup();
  await localGame(gestor, 'Ana', [mv('e2', 'e4'), mv('e7', 'e5')]);
  const res = await request(app).get('/games');
  assert.equal(res.body.emptyReason, undefined);
  assert.equal(res.body.total, 1);
  const item = res.body.items[0];
  assert.deepEqual(Object.keys(item).sort(), [
    'blackPlayerName', 'difficulty', 'endedAt', 'id', 'mode', 'moveCount',
    'result', 'source', 'startedAt', 'status', 'whitePlayerName',
  ]);
  assert.equal(item.moveCount, 2);
  assert.equal(item.difficulty, null);
  assert.equal(item.source, 'USER');
});

test('each filter and combinations narrow the list; blank values are ignored', async () => {
  const { app, gestor } = setup();
  const local = await localGame(gestor, 'Ana');
  const sf = (await gestor.crearPartida({ mode: 'STOCKFISH', alias: 'Bo', difficulty: 'DIFICIL' })).id;
  const sf2 = (await gestor.crearPartida({ mode: 'STOCKFISH', alias: 'Cy', difficulty: 'FACIL' })).id;
  await gestor.rendirse(sf2, { color: 'BLACK' }); // white wins -> 1-0
  await gestor.pausarPartida(local);

  const ids = async (q) => (await request(app).get('/games').query(q)).body.items.map((i) => i.id).sort();
  assert.deepEqual(await ids({ mode: 'LOCAL' }), [local]);
  assert.deepEqual(await ids({ mode: 'STOCKFISH' }), [sf, sf2].sort());
  assert.deepEqual(await ids({ difficulty: 'DIFICIL' }), [sf]);
  assert.deepEqual(await ids({ status: 'PENDIENTE' }), [local]);
  assert.deepEqual(await ids({ status: 'FINALIZADA' }), [sf2]);
  assert.deepEqual(await ids({ result: '1-0' }), [sf2]);
  assert.deepEqual(await ids({ mode: 'STOCKFISH', status: 'EN_PROGRESO' }), [sf]);
  assert.deepEqual(await ids({ mode: 'STOCKFISH', difficulty: 'FACIL', result: '1-0' }), [sf2]);
  assert.deepEqual(await ids({ mode: '', status: '' }), [local, sf, sf2].sort());
  const filtered = await request(app).get('/games').query({ difficulty: 'FACIL' });
  assert.equal(filtered.body.items[0].difficulty, 'FACIL');
});

test('list is sorted newest first', async () => {
  const { app, store, gestor } = setup();
  const a = await localGame(gestor, 'A');
  const b = await localGame(gestor, 'B');
  store.games.find((g) => g.id === a).startedAt = new Date('2024-01-01T00:00:00Z');
  store.games.find((g) => g.id === b).startedAt = new Date('2024-06-01T00:00:00Z');
  const res = await request(app).get('/games');
  assert.deepEqual(res.body.items.map((i) => i.id), [b, a]);
});

test('pagination: defaults, limit/offset, bounds', async () => {
  const { app, gestor } = setup();
  for (let i = 0; i < 5; i++) await localGame(gestor, `P${i}`);
  const all = await request(app).get('/games');
  assert.equal(all.body.items.length, 5);
  assert.equal(all.body.total, 5);

  const page = await request(app).get('/games').query({ limit: 2, offset: 1 });
  assert.equal(page.body.items.length, 2);
  assert.equal(page.body.total, 5);
  assert.deepEqual(page.body.items.map((i) => i.id), all.body.items.slice(1, 3).map((i) => i.id));

  const beyond = await request(app).get('/games').query({ offset: 10 });
  assert.deepEqual(beyond.body.items, []);
  assert.equal(beyond.body.emptyReason, undefined);

  for (const q of [{ limit: 0 }, { limit: 201 }, { limit: 'x' }, { offset: -1 }]) {
    const res = await request(app).get('/games').query(q);
    assert.equal(res.status, 400, JSON.stringify(q));
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  }
  assert.equal((await request(app).get('/games').query({ limit: 200 })).status, 200);
});

test('invalid enum values return 400', async () => {
  const { app } = setup();
  for (const q of [{ mode: 'BLITZ' }, { difficulty: 'IMPOSIBLE' }, { status: 'DONE' }, { result: '2-0' }]) {
    const res = await request(app).get('/games').query(q);
    assert.equal(res.status, 400, JSON.stringify(q));
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  }
});

test('GET /games/:id returns the game with ordered moves', async () => {
  const { app, gestor } = setup();
  const id = await localGame(gestor, 'Ana', [mv('e2', 'e4'), mv('e7', 'e5'), mv('g1', 'f3')]);
  const res = await request(app).get(`/games/${id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.id, id);
  assert.equal(res.body.whitePlayerName, 'Ana');
  assert.deepEqual(res.body.moves.map((m) => m.san), ['e4', 'e5', 'Nf3']);
  assert.deepEqual(res.body.moves.map((m) => m.moveNumber), [1, 1, 2]);
  assert.deepEqual(res.body.moves.map((m) => m.color), ['WHITE', 'BLACK', 'WHITE']);
  assert.deepEqual(Object.keys(res.body.moves[0]).sort(), [
    'color', 'fenAfter', 'fenBefore', 'moveNumber', 'san', 'timeSpentMs',
  ]);
  assert.equal(res.body.moves[1].fenBefore, res.body.moves[0].fenAfter);
});

test('GET /games/:id -> 404 GAME_NOT_FOUND, 400 on a malformed id', async () => {
  const { app } = setup();
  const missing = await request(app).get(`/games/${randomUUID()}`);
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, 'GAME_NOT_FOUND');
  assert.equal((await request(app).get(`/games/${randomUUID()}/pgn`)).status, 404);
  assert.equal((await request(app).get('/games/not-a-uuid')).status, 400);
});

test('PGN export of a finished game: headers, Result and movetext, loadable by chess.js', async () => {
  const { app, gestor } = setup();
  const id = await localGame(gestor, 'Ana', [
    mv('f2', 'f3'), mv('e7', 'e5'), mv('g2', 'g4'), mv('d8', 'h4'),
  ]);
  const res = await request(app).get(`/games/${id}/pgn`);
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /application\/x-chess-pgn/);
  assert.equal(res.headers['content-disposition'], `attachment; filename=game-${id}.pgn`);
  const pgn = res.text;
  assert.match(pgn, /\[Event "UNViMe Chess"\]/);
  assert.match(pgn, /\[Site "[^"]+"\]/);
  assert.match(pgn, /\[Date "\d{4}\.\d{2}\.\d{2}"\]/);
  assert.match(pgn, /\[White "Ana"\]/);
  assert.match(pgn, /\[Black "Player 2"\]/);
  assert.match(pgn, /\[Result "0-1"\]/);
  assert.match(pgn, /1\. f3 e5 2\. g4 Qh4# 0-1\s*$/);

  const chess = new Chess();
  chess.loadPgn(pgn);
  assert.deepEqual(chess.history(), ['f3', 'e5', 'g4', 'Qh4#']);
  assert.equal(chess.isCheckmate(), true);
});

test('PGN export of a pending game uses Result "*"', async () => {
  const { app, gestor } = setup();
  const id = await localGame(gestor, 'Ana', [mv('e2', 'e4'), mv('e7', 'e5')]);
  await gestor.pausarPartida(id);
  const pgn = (await request(app).get(`/games/${id}/pgn`)).text;
  assert.match(pgn, /\[Result "\*"\]/);
  assert.match(pgn, /1\. e4 e5 \*\s*$/);
  new Chess().loadPgn(pgn);
});

test('PGN export of an in-progress game is also "*"; names with quotes stay well formed', async () => {
  const { app, gestor } = setup();
  const created = await gestor.crearPartida({ mode: 'LOCAL', alias: 'A "Q" B' });
  const pgn = (await request(app).get(`/games/${created.id}/pgn`)).text;
  assert.match(pgn, /\[White "A 'Q' B"\]/);
  assert.match(pgn, /\[Result "\*"\]\n\n\*\s*$/);
});

test('round trip: export -> import yields the same SANs and result', async () => {
  const { app, gestor, store } = setup();
  const id = await localGame(gestor, 'Ana', [
    mv('e2', 'e4'), mv('e7', 'e5'), mv('d1', 'h5'), mv('b8', 'c6'),
    mv('f1', 'c4'), mv('g8', 'f6'), mv('h5', 'f7'),
  ]);
  const pgn = (await request(app).get(`/games/${id}/pgn`)).text;
  const imported = await request(app).post('/games/import').send({ pgn });
  assert.equal(imported.status, 201);
  const detail = await request(app).get(`/games/${imported.body.id}`);
  const original = await request(app).get(`/games/${id}`);
  assert.deepEqual(detail.body.moves.map((m) => m.san), original.body.moves.map((m) => m.san));
  assert.equal(detail.body.result, '1-0');
  assert.equal(detail.body.whitePlayerName, 'Ana');
  assert.equal(store.games.length, 2);
});
