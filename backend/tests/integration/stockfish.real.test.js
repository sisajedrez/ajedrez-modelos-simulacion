import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { StockfishAdapter } from '../../src/engines/StockfishAdapter.js';
import { Tablero } from '../../src/domain/Tablero.js';
import { START_FEN } from '../../src/domain/fen.js';

const BIN = fileURLToPath(new URL('../../bin/stockfish.exe', import.meta.url));
const skip = existsSync(BIN) ? false : 'bin/stockfish.exe not present';

for (const skillLevel of [3, 20]) {
  test(`real Stockfish returns a legal move from the start position (skill ${skillLevel})`, { skip }, async () => {
    const adapter = new StockfishAdapter({
      command: BIN,
      movetimeMs: 1000, // production values: search must fit in the 3000 ms budget
      timeoutMs: 3000,
      skillLevel,
    });
    try {
      const move = await adapter.getBestMove(START_FEN);
      assert.equal(new Tablero().validarMovimientoLegal(move).legal, true);
    } finally {
      await adapter.dispose();
    }
  });
}
