// Stress (a): long games (> 100 full moves) played through the API against a real PostgreSQL.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { createTestContext } from '../db/helpers.js';
import { envInt, fmt, makeApi, mulberry32, pickMove, report, scaled, stats } from './util.js';

const TARGET_LONG_GAMES = scaled(envInt('STRESS_LONG_GAMES', 3));
const MAX_PLIES = envInt('STRESS_LONG_MAX_PLIES', 240); // 120 full moves
const MIN_PLIES_FOR_LONG = 200; // "exceeds 100 full moves"
const MAX_SEEDS = 60;

let ctx;
let api;

before(async () => {
  ctx = await createTestContext();
  await ctx.resetDatabase();
  api = makeApi(ctx);
});
after(async () => {
  await ctx?.close();
});

// Plays one game with seeded random legal moves until MAX_PLIES or game end. Returns the evidence.
async function playGame(seed) {
  const rng = mulberry32(seed);
  const chess = new Chess();
  const created = await api('POST', '/games', { mode: 'LOCAL', alias: `Long-${seed}` });
  assert.equal(created.status, 201);
  const id = created.body.id;
  const latencies = [];
  let last = null;
  let ended = false;
  while (chess.history().length < MAX_PLIES) {
    const move = pickMove(chess, rng);
    if (!move) break;
    const res = await api('POST', `/games/${id}/moves`, move);
    assert.equal(res.status, 200, `seed ${seed} ply ${chess.history().length + 1}: ${res.text}`);
    latencies.push(res.ms);
    chess.move(move);
    last = res.body;
    if (res.body.status === 'FINALIZADA') {
      ended = true;
      break;
    }
  }
  return { seed, id, chess, latencies, last, ended };
}

async function verifyGame({ id, chess, last }) {
  const sans = chess.history();
  const detail = await api('GET', `/games/${id}`);
  assert.equal(detail.status, 200);
  const moves = detail.body.moves;

  // Every ply persisted, in order, with the right move number and colour.
  assert.equal(moves.length, sans.length, 'every ply is returned by GET /games/:id');
  assert.equal(await ctx.scalar('SELECT COUNT(*) FROM moves WHERE game_id = $1', [id]), sans.length);
  moves.forEach((m, i) => {
    assert.equal(m.san, sans[i], `san at ply ${i + 1}`);
    assert.equal(m.moveNumber, Math.floor(i / 2) + 1, `moveNumber at ply ${i + 1}`);
    assert.equal(m.color, i % 2 === 0 ? 'WHITE' : 'BLACK', `color at ply ${i + 1}`);
    if (i > 0) assert.equal(m.fenBefore, moves[i - 1].fenAfter, `fen chain at ply ${i + 1}`);
  });
  assert.equal(
    await ctx.scalar(
      `SELECT COUNT(*) FROM (SELECT 1 FROM moves WHERE game_id = $1 GROUP BY move_number, color HAVING COUNT(*) > 1) d`,
      [id],
    ),
    0,
    'no duplicated (move_number, color)',
  );

  // current_fen equals the last move's fen_after (and the API response, and the board).
  const row = (await ctx.query('SELECT current_fen, status FROM games WHERE id = $1', [id])).rows[0];
  assert.equal(row.current_fen, moves.at(-1).fenAfter);
  assert.equal(row.current_fen, chess.fen());
  assert.equal(row.current_fen, last.fen);
  assert.equal(detail.body.fen, row.current_fen);
  assert.equal(row.status, last.status);

  // PGN export -> import round trip yields the identical SAN list.
  const pgn = await api('GET', `/games/${id}/pgn`);
  assert.equal(pgn.status, 200);
  const imported = await api('POST', '/games/import', { pgn: pgn.text });
  assert.equal(imported.status, 201, imported.text);
  assert.equal(imported.body.moveCount, sans.length);
  const copy = await api('GET', `/games/${imported.body.id}`);
  assert.deepEqual(copy.body.moves.map((m) => m.san), sans);
  assert.equal(copy.body.fen, row.current_fen, 'imported copy ends in the same position');
}

test('long games: > 100 full moves persist, replay and round-trip through PGN', { timeout: 600_000 }, async (t) => {
  const t0 = performance.now();
  const all = [];
  const longGames = [];
  const perGame = [];
  for (let seed = 1; seed <= MAX_SEEDS && longGames.length < TARGET_LONG_GAMES; seed++) {
    const game = await playGame(seed);
    const plies = game.chess.history().length;
    all.push(...game.latencies);
    await verifyGame(game);
    perGame.push(`seed ${seed}: ${plies} plies (${Math.floor((plies + 1) / 2)} full moves), ${game.ended ? `ended ${game.last.result}` : 'in progress'}`);
    if (plies > MIN_PLIES_FOR_LONG) longGames.push(game);
  }
  assert.ok(
    longGames.length >= TARGET_LONG_GAMES,
    `needed ${TARGET_LONG_GAMES} games above 100 full moves, got ${longGames.length}`,
  );

  const totalMs = performance.now() - t0;
  const st = stats(all);
  report('LONG GAMES', [
    ...perGame,
    `long games (>100 full moves): ${longGames.length}, total plies played: ${all.length}`,
    `per-move POST latency: ${fmt(st)}`,
    `total time: ${(totalMs / 1000).toFixed(1)}s`,
  ]);
  t.diagnostic(`long games=${longGames.length} plies=${all.length} ${fmt(st)} total=${(totalMs / 1000).toFixed(1)}s`);
});
