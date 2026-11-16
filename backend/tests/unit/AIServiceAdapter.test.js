import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { AIServiceAdapter, AIServiceError } from '../../src/engines/AIServiceAdapter.js';
import { FakeAIServer, closedPortUrl } from '../fakes/FakeAIServer.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
let server;
before(async () => {
  server = await new FakeAIServer().start();
});
after(() => server.stop());

const adapter = (over = {}) => new AIServiceAdapter({ baseUrl: server.url, timeoutMs: 150, ...over });
const rejectsKind = (p, kind) => assert.rejects(p, (e) => e instanceof AIServiceError && e.kind === kind);

test('predictMove sends {fen, difficulty, elo:null} and parses history/openings', async () => {
  for (const behavior of ['history', 'openings']) {
    server.behavior = behavior;
    server.move = 'e7e8q';
    server.requests.length = 0;
    const res = await adapter().predictMove({ fen: START, difficulty: 'MEDIO' });
    assert.deepEqual(res, { move: { from: 'e7', to: 'e8', promotion: 'q' }, source: behavior });
    assert.equal(server.requests[0].url, '/predict-move');
    assert.deepEqual(server.requests[0].body, { fen: START, difficulty: 'MEDIO', elo: null });
  }
  server.move = null;
});

test('predictMove returns a null move for source none', async () => {
  server.behavior = 'none';
  assert.deepEqual(await adapter().predictMove({ fen: START, difficulty: 'FACIL' }), {
    move: null,
    source: 'none',
  });
});

test('malformed JSON and wrong shape are invalid_payload', async () => {
  for (const behavior of ['malformed', 'wrongshape']) {
    server.behavior = behavior;
    await rejectsKind(adapter().predictMove({ fen: START, difficulty: 'FACIL' }), 'invalid_payload');
  }
});

test('a non-UCI move string is invalid_payload', async () => {
  server.behavior = 'history';
  server.move = 'e2-e4';
  await rejectsKind(adapter().predictMove({ fen: START, difficulty: 'FACIL' }), 'invalid_payload');
  server.move = null;
});

test('HTTP 500 is kind http with the status', async () => {
  server.behavior = 'error500';
  await assert.rejects(adapter().predictMove({ fen: START, difficulty: 'FACIL' }), (e) => {
    return e.kind === 'http' && e.httpStatus === 500;
  });
});

test('a slow answer times out', async () => {
  server.behavior = 'slow';
  server.slowMs = 600;
  await rejectsKind(adapter({ timeoutMs: 80 }).predictMove({ fen: START, difficulty: 'FACIL' }), 'timeout');
});

test('connection refused is kind network', async () => {
  const a = new AIServiceAdapter({ baseUrl: await closedPortUrl(), timeoutMs: 500 });
  await rejectsKind(a.predictMove({ fen: START, difficulty: 'FACIL' }), 'network');
});

test('without a URL it reports unavailable and never calls fetch', async () => {
  let calls = 0;
  const a = new AIServiceAdapter({ baseUrl: undefined, fetchFn: () => calls++ });
  assert.equal(a.configured, false);
  await rejectsKind(a.predictMove({ fen: START, difficulty: 'FACIL' }), 'not_configured');
  assert.equal(await a.health(), false);
  assert.equal(calls, 0);
});

test('health is true when up and false (never throws) when down or erroring', async () => {
  assert.equal(await adapter().health(), true);
  assert.equal(await new AIServiceAdapter({ baseUrl: await closedPortUrl(), timeoutMs: 300 }).health(), false);
  const throwing = new AIServiceAdapter({
    baseUrl: 'http://x',
    fetchFn: () => {
      throw new Error('x');
    },
  });
  assert.equal(await throwing.health(), false);
});

test('seedDataset and trainModel POST to their endpoints', async () => {
  server.behavior = 'history';
  server.requests.length = 0;
  await adapter().seedDataset();
  await adapter().trainModel();
  assert.deepEqual(
    server.requests.map((r) => `${r.method} ${r.url}`),
    ['POST /dataset/seed', 'POST /model/train'],
  );
});
