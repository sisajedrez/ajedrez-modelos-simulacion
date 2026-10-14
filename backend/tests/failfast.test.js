import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('server exits with code 1 when DATABASE_URL is missing', () => {
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const env = {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: '3999',
    FRONTEND_URL: 'http://localhost:5173',
  };
  delete env.DATABASE_URL;
  const result = spawnSync(process.execPath, ['src/server.js'], {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_URL/);
});
