import test from 'node:test';
import assert from 'node:assert/strict';
import { GestorDePartida } from '../../src/services/GestorDePartida.js';
import { GameSessionFactory } from '../../src/services/GameSessionFactory.js';
import { SessionRegistry } from '../../src/services/SessionRegistry.js';
import {
  createStore,
  FakeGameRepository,
  FakeMoveRepository,
  FakeDifficultyProfileRepository,
  createFakeWithTransaction,
} from '../fakes/index.js';

function fakeStockfishAdapter(move = { from: 'e2', to: 'e4' }) {
  return {
    disposed: false,
    async getBestMove() {
      return move;
    },
    async dispose() {
      this.disposed = true;
    },
  };
}

function fakeAiAdapter(move = { from: 'e7', to: 'e5' }) {
  return {
    async predictMove() {
      return { move, source: 'history' };
    },
  };
}

function setupSimulation(sfMove = { from: 'e2', to: 'e4' }, aiMove = { from: 'e7', to: 'e5' }) {
  const store = createStore();
  const gameRepo = new FakeGameRepository(store);
  const moveRepo = new FakeMoveRepository(store);
  const difficultyRepo = new FakeDifficultyProfileRepository(store);
  const registry = new SessionRegistry();
  const sfAdapter = fakeStockfishAdapter(sfMove);
  const aiAdapter = fakeAiAdapter(aiMove);

  const factory = new GameSessionFactory({
    fallbackSkillLevel: 0,
    adapterFactory: () => sfAdapter,
    aiAdapterFactory: () => aiAdapter,
  });

  const gestor = new GestorDePartida({
    gameRepo,
    moveRepo,
    difficultyRepo,
    registry,
    factory,
    withTransaction: createFakeWithTransaction(store),
  });

  return { gestor, gameRepo, moveRepo, sfAdapter, aiAdapter, registry };
}

test('SIMULATION creates game with Stockfish and AI without human players', async () => {
  const { gestor, gameRepo } = setupSimulation();
  const game = await gestor.crearPartida({ mode: 'SIMULATION', difficulty: 'MEDIO' });

  assert.equal(game.mode, 'SIMULATION');
  assert.equal(game.whitePlayerName, 'Stockfish');
  assert.equal(game.blackPlayerName, 'IA UNViMe');

  const stored = await gameRepo.findById(game.id);
  assert.equal(stored.whiteType, 'ENGINE');
  assert.equal(stored.blackType, 'AI');
});

test('SIMULATION rejects human moves with NOT_YOUR_TURN', async () => {
  const { gestor } = setupSimulation();
  const game = await gestor.crearPartida({ mode: 'SIMULATION', difficulty: 'MEDIO' });

  await assert.rejects(
    gestor.realizarJugada(game.id, { from: 'e2', to: 'e4' }),
    { code: 'NOT_YOUR_TURN', status: 409 }
  );
});

test('SIMULATION plays alternating turns: Stockfish (white) then AI (black)', async () => {
  const { gestor, moveRepo } = setupSimulation({ from: 'e2', to: 'e4' }, { from: 'e7', to: 'e5' });
  const game = await gestor.crearPartida({ mode: 'SIMULATION', difficulty: 'MEDIO' });

  // White turn (Stockfish)
  const turn1 = await gestor.jugarTurnoMaquina(game.id);
  assert.equal(turn1.valid, true);
  assert.equal(turn1.san, 'e4');
  assert.equal(turn1.engineSource, 'stockfish');

  // Black turn (AI)
  const turn2 = await gestor.jugarTurnoMaquina(game.id);
  assert.equal(turn2.valid, true);
  assert.equal(turn2.san, 'e5');
  assert.equal(turn2.engineSource, 'history');

  const moves = await moveRepo.findByGameId(game.id);
  assert.equal(moves.length, 2);
  assert.equal(moves[0].color, 'WHITE');
  assert.equal(moves[1].color, 'BLACK');
});
