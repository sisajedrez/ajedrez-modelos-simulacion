import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MoveRepository } from '../../src/repositories/MoveRepository.js';

test('D-08: the AI training query only reads moves of FINALIZADA games', async () => {
  const calls = [];
  const repo = new MoveRepository({
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ fen_before: 'f', san: 'e4', result: '1-0' }] };
    },
  });
  const rows = await repo.findTrainingMoves();
  assert.match(calls[0].sql, /g\.status = 'FINALIZADA'/);
  assert.match(calls[0].sql, /JOIN games g ON g\.id = m\.game_id/);
  assert.deepEqual(rows, [{ fenBefore: 'f', san: 'e4', result: '1-0' }]);
});
