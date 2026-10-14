import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { AIServiceAdapter } from '../../src/engines/AIServiceAdapter.js';
import { CustomAIOpponent } from '../../src/engines/CustomAIOpponent.js';
import { StockfishOpponent } from '../../src/engines/StockfishOpponent.js';
import { FakeAIServer, closedPortUrl } from '../fakes/FakeAIServer.js';
import { createFakeEngine } from '../fakes/index.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
let server;
before(async () => {
  server = await new FakeAIServer().start();
});
after(() => server.stop());

function build({ url = server.url, timeoutMs = 150 } = {}) {
  const engine = createFakeEngine();
  const warnings = [];
  const opponent = new CustomAIOpponent({
    adapter: new AIServiceAdapter({ baseUrl: url, timeoutMs }),
    difficulty: 'MEDIO',
    logger: { warn: (m) => warnings.push(m) },
    fallbackFactory: () =>
      new StockfishOpponent({ adapter: engine.adapterFactory({ skillLevel: 0 }), skillLevel: 0 }),
  });
  return { opponent, engine, warnings };
}

for (const source of ['history', 'openings']) {
  test(`uses the AI move when source is ${source}`, async () => {
    server.behavior = source;
    server.move = null;
    const { opponent, engine, warnings } = build();
    const move = await opponent.getNextMove(START);
    assert.equal(move.source, source);
    assert.deepEqual([move.from, move.to], ['g1', 'h3']); // last legal move, not the fake Stockfish's first
    assert.equal(engine.created.length, 0);
    assert.equal(warnings.length, 0);
  });
}

for (const behavior of ['none', 'illegal', 'malformed', 'wrongshape', 'error500', 'slow']) {
  test(`falls back to Stockfish skill 0 on: ${behavior}`, async () => {
    server.behavior = behavior;
    server.slowMs = 600;
    const { opponent, engine, warnings } = build({ timeoutMs: 100 });
    const move = await opponent.getNextMove(START);
    assert.equal(move.source, 'fallback');
    assert.deepEqual([move.from, move.to], ['a2', 'a3']); // fake Stockfish: first legal move
    assert.equal(engine.created.length, 1);
    assert.equal(engine.created[0].skillLevel, 0);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /falling back/);
  });
}

test('falls back when the connection is refused and when the URL is not configured', async () => {
  for (const url of [await closedPortUrl(), undefined]) {
    const { opponent, engine, warnings } = build({ url, timeoutMs: 500 });
    assert.equal((await opponent.getNextMove(START)).source, 'fallback');
    assert.equal(engine.created[0].skillLevel, 0);
    assert.equal(warnings.length, 1);
  }
});

test('an illegal AI move is never returned: it is verified against the board', async () => {
  server.behavior = 'history';
  server.move = 'e2e5';
  const { opponent } = build();
  const move = await opponent.getNextMove(START);
  assert.equal(move.source, 'fallback');
  assert.notEqual(`${move.from}${move.to}`, 'e2e5');
  server.move = null;
});

test('the fallback engine is created lazily, reused, and disposed with the opponent', async () => {
  server.behavior = 'none';
  const { opponent, engine } = build();
  await opponent.getNextMove(START);
  await opponent.getNextMove(START);
  assert.equal(engine.created.length, 1);
  await opponent.dispose();
  await opponent.dispose();
  assert.equal(engine.created[0].disposed, 1);
});

test('dispose without any fallback is a no-op', async () => {
  const { opponent, engine } = build();
  await opponent.dispose();
  assert.equal(engine.created.length, 0);
});
