import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv } from '../src/config/parseEnv.js';

const valid = {
  HOST: '127.0.0.1',
  PORT: '3001',
  FRONTEND_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db',
};

test('parseEnv succeeds with valid input and applies defaults', () => {
  const cfg = parseEnv(valid);
  assert.equal(cfg.host, '127.0.0.1');
  assert.equal(cfg.nodeEnv, 'development');
  assert.equal(cfg.stockfishMovetimeMs, 1000);
  assert.equal(cfg.aiServiceTimeoutMs, 5000);
  assert.ok(Object.isFrozen(cfg));
});

test('parseEnv throws when DATABASE_URL is missing', () => {
  const { DATABASE_URL, ...rest } = valid;
  assert.throws(() => parseEnv(rest), /DATABASE_URL/);
});

test('parseEnv coerces PORT to a number', () => {
  assert.equal(parseEnv(valid).port, 3001);
});

test('parseEnv treats empty optional values as unset', () => {
  assert.equal(parseEnv({ ...valid, STOCKFISH_PATH: '' }).stockfishPath, undefined);
});

test('parseEnv rejects AI_SERVICE_TIMEOUT_MS <= STOCKFISH_TIMEOUT_MS', () => {
  const bad = { ...valid, STOCKFISH_TIMEOUT_MS: '3000', AI_SERVICE_TIMEOUT_MS: '3000' };
  assert.throws(() => parseEnv(bad), /AI_SERVICE_TIMEOUT_MS.*greater than STOCKFISH_TIMEOUT_MS/);
  assert.throws(() => parseEnv({ ...bad, AI_SERVICE_TIMEOUT_MS: '1000' }), /AI_SERVICE_TIMEOUT_MS/);
  assert.equal(parseEnv({ ...bad, AI_SERVICE_TIMEOUT_MS: '3001' }).aiServiceTimeoutMs, 3001);
});

test('parseEnv works without AI_SERVICE_URL', () => {
  assert.equal(parseEnv(valid).aiServiceUrl, undefined);
});
