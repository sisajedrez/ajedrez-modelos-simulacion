import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

const frontendUrl = 'http://localhost:5173';
const appWith = (up) => createApp({ frontendUrl, checkDb: async () => up });

test('GET /health reports db up', async () => {
  const res = await request(appWith(true)).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.db, 'up');
  assert.equal(typeof res.body.uptime, 'number');
  assert.ok(!Number.isNaN(Date.parse(res.body.timestamp)));
});

test('GET /health reports db down with HTTP 200', async () => {
  const res = await request(appWith(false)).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.db, 'down');
});

test('GET /health reports the ai status and stays 200', async () => {
  for (const state of ['up', 'down', 'not_configured']) {
    const app = createApp({ frontendUrl, checkDb: async () => true, checkAi: async () => state });
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.ai, state);
  }
  const boom = async () => {
    throw new Error('x');
  };
  const throwing = createApp({ frontendUrl, checkDb: async () => true, checkAi: boom });
  assert.equal((await request(throwing).get('/health')).body.ai, 'down');
  assert.equal((await request(appWith(true)).get('/health')).body.ai, 'not_configured');
});

test('unknown route returns NOT_FOUND shape', async () => {
  const res = await request(appWith(true)).get('/nope');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
  assert.equal(res.body.error.retryable, false);
  assert.equal(typeof res.body.error.message, 'string');
});

test('malformed JSON returns VALIDATION_ERROR', async () => {
  const res = await request(appWith(true))
    .post('/health')
    .set('Content-Type', 'application/json')
    .send('{"bad":');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  assert.equal(res.body.error.retryable, false);
});

test('CORS allows the configured origin only', async () => {
  const app = appWith(true);
  const allowed = await request(app).get('/health').set('Origin', frontendUrl);
  assert.equal(allowed.headers['access-control-allow-origin'], frontendUrl);
  const other = await request(app).get('/health').set('Origin', 'http://evil.example');
  assert.equal(other.headers['access-control-allow-origin'], undefined);
});
