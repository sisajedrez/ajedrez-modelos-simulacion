import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { StockfishAdapter } from '../../src/engines/StockfishAdapter.js';
import { START_FEN } from '../../src/domain/fen.js';

const FAKE = fileURLToPath(new URL('../fakes/fake-stockfish.js', import.meta.url));

function make({ env = {}, timeoutMs = 8000, skillLevel = 7, ...rest } = {}) {
  return new StockfishAdapter({
    command: process.execPath,
    args: [FAKE],
    env,
    movetimeMs: 50,
    timeoutMs,
    skillLevel,
    ...rest,
  });
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const tmp = () => join(tmpdir(), `fakesf-${randomUUID()}`);

test('handshake, skill level, isready and go movetime are sent; bestmove is parsed', async () => {
  const log = tmp();
  const adapter = make({ env: { FAKE_SF_LOG: log } });
  try {
    const move = await adapter.getBestMove(START_FEN);
    assert.match(move.from, /^[a-h][1-8]$/);
    assert.match(move.to, /^[a-h][1-8]$/);
    const lines = readFileSync(log, 'utf8').trim().split('\n');
    assert.equal(lines[0], 'uci');
    assert.ok(lines.includes('setoption name Skill Level value 7'));
    assert.ok(lines.indexOf('isready') < lines.indexOf(`position fen ${START_FEN}`));
    assert.ok(lines.includes('go movetime 50'));
  } finally {
    await adapter.dispose();
    rmSync(log, { force: true });
  }
});

test('parses promotion moves', async () => {
  const adapter = make({ env: { FAKE_SF_MOVE: 'e7e8q' } });
  try {
    assert.deepEqual(await adapter.getBestMove(START_FEN), { from: 'e7', to: 'e8', promotion: 'q' });
  } finally {
    await adapter.dispose();
  }
});

test('plain moves have no promotion key', async () => {
  const adapter = make({ env: { FAKE_SF_MOVE: 'e2e4' } });
  try {
    assert.deepEqual(await adapter.getBestMove(START_FEN), { from: 'e2', to: 'e4' });
  } finally {
    await adapter.dispose();
  }
});

test('bestmove (none) is an error', async () => {
  const adapter = make({ env: { FAKE_SF_MODE: 'none' } });
  try {
    await assert.rejects(adapter.getBestMove(START_FEN), { code: 'ENGINE_NO_MOVE' });
  } finally {
    await adapter.dispose();
  }
});

test('a hanging engine times out with ENGINE_TIMEOUT 504 and the process is killed', async () => {
  const adapter = make({ env: { FAKE_SF_MODE: 'hang' }, timeoutMs: 400 });
  const started = Date.now();
  await assert.rejects(adapter.getBestMove(START_FEN), {
    code: 'ENGINE_TIMEOUT',
    status: 504,
    retryable: true,
  });
  assert.ok(Date.now() - started < 3000);
  assert.equal(adapter.pid, undefined);
  await adapter.dispose();
});

test('the engine restarts transparently after a timeout', async () => {
  const marker = tmp();
  const adapter = make({ env: { FAKE_SF_MODE: 'hang_once', FAKE_SF_STATE: marker }, timeoutMs: 2500 });
  try {
    await assert.rejects(adapter.getBestMove(START_FEN), { code: 'ENGINE_TIMEOUT' });
    const move = await adapter.getBestMove(START_FEN);
    assert.ok(move.from && move.to);
  } finally {
    await adapter.dispose();
    rmSync(marker, { force: true });
  }
});

test('a crashing engine yields ENGINE_UNAVAILABLE 503', async () => {
  const adapter = make({ env: { FAKE_SF_MODE: 'crash' } });
  try {
    await assert.rejects(adapter.getBestMove(START_FEN), {
      code: 'ENGINE_UNAVAILABLE',
      status: 503,
      retryable: true,
    });
  } finally {
    await adapter.dispose();
  }
});

test('a missing binary yields ENGINE_UNAVAILABLE', async () => {
  const adapter = new StockfishAdapter({ command: join(tmpdir(), `no-such-${randomUUID()}.exe`) });
  await assert.rejects(adapter.getBestMove(START_FEN), { code: 'ENGINE_UNAVAILABLE', status: 503 });
  await adapter.dispose();
});

test('a missing command (STOCKFISH_PATH unset) yields ENGINE_UNAVAILABLE', async () => {
  const adapter = new StockfishAdapter({ command: undefined });
  await assert.rejects(adapter.getBestMove(START_FEN), { code: 'ENGINE_UNAVAILABLE', status: 503 });
});

test('concurrent requests are serialized on one process', async () => {
  const log = tmp();
  const adapter = make({ env: { FAKE_SF_LOG: log } });
  try {
    const results = await Promise.all([
      adapter.getBestMove(START_FEN),
      adapter.getBestMove(START_FEN),
      adapter.getBestMove(START_FEN),
    ]);
    assert.equal(results.length, 3);
    const lines = readFileSync(log, 'utf8').trim().split('\n');
    assert.equal(lines.filter((l) => l === 'uci').length, 1);
    assert.equal(lines.filter((l) => l.startsWith('go ')).length, 3);
  } finally {
    await adapter.dispose();
    rmSync(log, { force: true });
  }
});

test('dispose leaves no process, is idempotent and blocks further use', async () => {
  const adapter = make();
  await adapter.getBestMove(START_FEN);
  const pid = adapter.pid;
  assert.ok(pid);
  await adapter.dispose();
  await adapter.dispose();
  assert.equal(isAlive(pid), false);
  await assert.rejects(adapter.getBestMove(START_FEN), { code: 'ENGINE_UNAVAILABLE' });
});

test('dispose before any use is a no-op', async () => {
  await make().dispose();
});
