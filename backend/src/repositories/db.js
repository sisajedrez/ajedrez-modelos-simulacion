import pg from 'pg';
import { config } from '../config/env.js';

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

// Idle client errors must not crash the process.
pool.on('error', (err) => console.error('Unexpected PostgreSQL pool error:', err.message));

export const query = (text, params) => pool.query(text, params);

export async function checkConnection() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export const closePool = () => pool.end();

// Runs fn(client) inside BEGIN/COMMIT; ROLLBACK on any error.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
