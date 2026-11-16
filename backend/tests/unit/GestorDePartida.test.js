import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestContext } from '../fakes/index.js';
import { START_FEN } from '../../src/domain/fen.js';

const mv = (from, to, promotion) => ({ from, to, promotion });

test('crearPartida LOCAL stores a HUMAN vs HUMAN game at the start position', async () => {
  const { gestor, store, registry } = createTestContext();
  const game = await gestor.crearPartida({ mode: 'LOCAL', alias: 'Ana', playerColor: 'WHITE' });
  assert.equal(game.status, 'EN_PROGRESO');
  assert.equal(game.fen, START_FEN);
  assert.equal(game.turn, 'WHITE');
  assert.equal(game.whitePlayerName, 'Ana');
  assert.equal(game.blackPlayerName, 'Player 2');
  assert.equal(store.games[0].whiteType, 'HUMAN');
  assert.equal(store.games[0].blackType, 'HUMAN');
  assert.ok(registry.get(game.id));
});

test('crearPartida swaps names when the alias plays black', async () => {
  const { gestor } = createTestContext();
  const game = await gestor.crearPartida({ mode: 'LOCAL', alias: 'Ana', playerColor: 'BLACK' });
  assert.equal(game.whitePlayerName, 'Player 2');
  assert.equal(game.blackPlayerName, 'Ana');
});

test('crearPartida resolves a difficulty profile and rejects unknown names', async () => {
  const { gestor, store } = createTestContext();
  const game = await gestor.crearPartida({ mode: 'LOCAL', alias: 'Ana', difficulty: 'MEDIO' });
  assert.equal(game.difficultyProfileId, store.profiles.find((p) => p.name === 'MEDIO').id);
  await assert.rejects(
    gestor.crearPartida({ mode: 'LOCAL', alias: 'Ana', difficulty: 'NOPE' }),
    { code: 'VALIDATION_ERROR', status: 400 },
  );
});

test('crearPartida rejects unavailable modes with 501 and stores nothing', async () => {
  const { gestor, store } = createTestContext();
  await assert.rejects(
    gestor.crearPartida({ mode: 'STOCKFISH', alias: 'Ana', difficulty: 'FACIL' }),
    { code: 'MODE_NOT_AVAILABLE', status: 501 },
  );
  assert.equal(store.games.length, 0);
});

test('a legal move persists the move row and the new fen', async () => {
  const { gestor, store } = createTestContext();
  const game = await gestor.crearPartida({ mode: 'LOCAL', alias: 'Ana' });
  const res = await gestor.realizarJugada(game.id, mv('e2', 'e4'));
  assert.equal(res.valid, true);
  assert.equal(res.san, 'e4');
  assert.equal(res.status, 'EN_PROGRESO');
  assert.equal(res.result, null);
  assert.equal(res.endReason, null);
  assert.equal(store.moves.length, 1);
  const row = store.moves[0];
  assert.equal(row.moveNumber, 1);
  assert.equal(row.color, 'WHITE');
  assert.equal(row.fenBefore, START_FEN);
  assert.equal(row.fenAfter, res.fen);
  assert.equal(row.evalScore, null);
  assert.equal(row.timeSpentMs, null);
  assert.equal(store.games[0].currentFen, res.fen);

  await gestor.realizarJugada(game.id, mv('e7', 'e5'));
  assert.equal(store.moves[1].moveNumber, 1);
  assert.equal(store.moves[1].color, 'BLACK');
  await gestor.realizarJugada(game.id, mv('g1', 'f3'));
  assert.equal(store.moves[2].moveNumber, 2);
});

test('an illegal move returns 422 and persists nothing', async () => {
  const { gestor, store } = createTestContext();
  const game = await gestor.crearPartida({ mode: 'LOCAL', alias: 'Ana' });
  await assert.rejects(gestor.realizarJugada(game.id, mv('e2', 'e5')), {
    code: 'ILLEGAL_MOVE',
    status: 422,
  });
  assert.equal(store.moves.length, 0);
  assert.equal(store.games[0].currentFen, START_FEN);
  // The board is untouched: the same side can still play.
  const ok = await gestor.realizarJugada(game.id, mv('e2', 'e4'));
  assert.equal(ok.valid, true);
});

test('a failing transaction rolls back and the session is rebuilt afterwards', async () => {
  const ctx = createTestContext();
  const { gestor, store, registry } = ctx;
  const game = await gestor.crearPartida({ mode: 'LOCAL', alias: 'Ana' });
  const original = gestor.gameRepo.updateFen;
  gestor.gameRepo.updateFen = async () => {
    throw new Error('db down');
  };
  await assert.rejects(gestor.realizarJugada(game.id, mv('e2', 'e4')), /db down/);
  assert.equal(store.moves.length, 0);
  assert.equal(registry.get(game.id), undefined);
  gestor.gameRepo.updateFen = original;
  const ok = await gestor.realizarJugada(game.id, mv('e2', 'e4'));
  assert.equal(ok.valid, true);
  assert.equal(store.moves.length, 1);
});

test('unknown game returns 404', async () => {
  const { gestor } = createTestContext();
  await assert.rejects(gestor.realizarJugada(randomUUID(), mv('e2', 'e4')), {
    code: 'GAME_NOT_FOUND',
    status: 404,
  });
  await assert.rejects(gestor.obtenerMovimientosLegales(randomUUID(), 'e2'), { status: 404 });
});

test("fool's mate finishes the game; further moves and resign return 409", async () => {
  const { gestor, store, registry } = createTestContext();
  const game = await gestor.crearPartida({ mode: 'LOCAL', alias: 'Ana' });
  await gestor.realizarJugada(game.id, mv('f2', 'f3'));
  await gestor.realizarJugada(game.id, mv('e7', 'e5'));
  await gestor.realizarJugada(game.id, mv('g2', 'g4'));
  const last = await gestor.realizarJugada(game.id, mv('d8', 'h4'));
  assert.equal(last.status, 'FINALIZADA');
  assert.equal(last.result, '0-1');
  assert.equal(last.endReason, 'CHECKMATE');
  assert.equal(store.games[0].status, 'FINALIZADA');
  assert.equal(store.games[0].result, '0-1');
  assert.ok(store.games[0].endedAt);
  assert.equal(store.moves.length, 4);
  assert.equal(registry.get(game.id), undefined);

  await assert.rejects(gestor.realizarJugada(game.id, mv('a2', 'a3')), {
    code: 'GAME_NOT_ACTIVE',
    status: 409,
  });
  await assert.rejects(gestor.rendirse(game.id), { status: 409 });
  assert.equal(store.moves.length, 4);
});

test('rendirse defaults to the side to move losing', async () => {
  const { gestor, store } = createTestContext();
  const game = await gestor.crearPartida({ mode: 'LOCAL', alias: 'Ana' });
  const res = await gestor.rendirse(game.id);
  assert.deepEqual(res, {
    valid: true,
    status: 'FINALIZADA',
    result: '0-1',
    endReason: 'RESIGNATION',
  });
  assert.equal(store.games[0].status, 'FINALIZADA');
  assert.equal(store.games[0].result, '0-1');
});

test('rendirse with an explicit color makes the opposite side win', async () => {
  const { gestor } = createTestContext();
  const game = await gestor.crearPartida({ mode: 'LOCAL', alias: 'Ana' });
  const res = await gestor.rendirse(game.id, { color: 'BLACK' });
  assert.equal(res.result, '1-0');
});

test('the session is rebuilt from move history when the registry is cleared', async () => {
  const { gestor, store, registry } = createTestContext();
  const game = await gestor.crearPartida({ mode: 'LOCAL', alias: 'Ana' });
  await gestor.realizarJugada(game.id, mv('e2', 'e4'));
  await gestor.realizarJugada(game.id, mv('e7', 'e5'));
  registry.clear();

  const legal = await gestor.obtenerMovimientosLegales(game.id, 'g1');
  assert.deepEqual(legal.map((m) => m.to).sort(), ['e2', 'f3', 'h3']);
  assert.ok(registry.get(game.id));

  registry.clear();
  const res = await gestor.realizarJugada(game.id, mv('g1', 'f3'));
  assert.equal(res.san, 'Nf3');
  assert.equal(store.moves.length, 3);
  assert.equal(store.moves[2].moveNumber, 2);
});

test('concurrent moves on one game are serialized', async () => {
  const { gestor, store } = createTestContext();
  const game = await gestor.crearPartida({ mode: 'LOCAL', alias: 'Ana' });
  const results = await Promise.allSettled([
    gestor.realizarJugada(game.id, mv('e2', 'e4')),
    gestor.realizarJugada(game.id, mv('e2', 'e4')),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(store.moves.length, 1);
});
