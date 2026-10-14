import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIServiceAdapter } from '../../src/engines/AIServiceAdapter.js';

// Contract test against the REAL AI service; skipped when it is not reachable.
const url = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const adapter = new AIServiceAdapter({ baseUrl: url, timeoutMs: 5000 });
const up = await adapter.health();

test('real AI service honours the /predict-move contract', { skip: !up && `AI service not reachable at ${url}` }, async () => {
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const res = await adapter.predictMove({ fen, difficulty: 'MEDIO' });
  assert.ok(['history', 'openings', 'none'].includes(res.source));
  if (res.move) assert.match(`${res.move.from}${res.move.to}`, /^[a-h][1-8][a-h][1-8]$/);
});
