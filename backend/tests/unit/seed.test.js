import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { seedFromPgn } from '../../scripts/seed.js';
import { splitPgnGames } from '../../src/services/PgnService.js';
import { createTestContext } from '../fakes/index.js';

const WIN = '[Event "a"]\n[White "W"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0\n';
const DRAW = '[Event "b"]\n[Result "1/2-1/2"]\n\n1. d4 d5 2. c4 e6 1/2-1/2\n';
const OPEN = '[Event "c"]\n[Result "*"]\n\n1. e4 e5 *\n';
const BROKEN = '[Event "d"]\n[Result "1-0"]\n\n1. e4 e5 2. Ke5 1-0\n';

function setup() {
  const ctx = createTestContext();
  const logs = [];
  const deps = { gameRepo: ctx.gameRepo, pgnService: ctx.pgnService, log: (m) => logs.push(m) };
  return { ...ctx, deps, logs };
}

test('splitPgnGames separates games at [Event tags (CRLF safe)', () => {
  assert.equal(splitPgnGames(`${WIN}\n${DRAW}\n${OPEN}`).length, 3);
  assert.equal(splitPgnGames((WIN + DRAW).replace(/\n/g, '\r\n')).length, 2);
  assert.equal(splitPgnGames('1. e4 e5 *').length, 1);
  assert.equal(splitPgnGames('  \n ').length, 0);
});

test('seed imports every finished game from several files as SEED', async () => {
  const { deps, store, logs } = setup();
  const res = await seedFromPgn([`${WIN}\n${DRAW}`, WIN], deps);
  assert.deepEqual(res, { alreadySeeded: false, imported: 3, skipped: 0 });
  assert.equal(store.games.length, 3);
  assert.ok(store.games.every((g) => g.source === 'SEED' && g.status === 'FINALIZADA'));
  assert.deepEqual(store.games.map((g) => g.result), ['1-0', '1/2-1/2', '1-0']);
  assert.equal(store.moves.length, 7 + 4 + 7);
  assert.match(logs.at(-1), /3 game\(s\) imported, 0 skipped/);
});

test('games without a decisive/draw result are skipped and counted', async () => {
  const { deps, store } = setup();
  const res = await seedFromPgn([`${WIN}\n${OPEN}`], deps);
  assert.equal(res.imported, 1);
  assert.equal(res.skipped, 1);
  assert.equal(store.games.length, 1);
});

test('seed is idempotent: a second run inserts nothing', async () => {
  const { deps, store, logs } = setup();
  await seedFromPgn([WIN], deps);
  const again = await seedFromPgn([WIN, DRAW], deps);
  assert.equal(again.alreadySeeded, true);
  assert.equal(store.games.length, 1);
  assert.match(logs.at(-1), /already exist/);
});

test('USER games do not count as seeded', async () => {
  const { deps, store, pgnService } = setup();
  await pgnService.importar(WIN);
  assert.equal(store.games[0].source, 'USER');
  const res = await seedFromPgn([DRAW], deps);
  assert.equal(res.imported, 1);
  assert.equal(store.games.length, 2);
});

test('invalid game aborts the seed before anything is written', async () => {
  const { deps, store } = setup();
  await assert.rejects(() => seedFromPgn([`${WIN}\n${BROKEN}`], deps), { code: 'INVALID_PGN' });
  assert.equal(store.games.length, 0);
  assert.equal(store.moves.length, 0);
});

test('a database failure midway rolls back every seeded game (all-or-nothing)', async () => {
  const { deps, store, moveRepo } = setup();
  const original = moveRepo.create.bind(moveRepo);
  let calls = 0;
  moveRepo.create = async (...args) => {
    if (++calls === 10) throw new Error('db down'); // inside the second game
    return original(...args);
  };
  await assert.rejects(() => seedFromPgn([`${WIN}\n${DRAW}`], deps), /db down/);
  assert.equal(store.games.length, 0);
  assert.equal(store.moves.length, 0);
});

test('the bundled sample file seeds 3 finished games', async () => {
  const sample = await readFile(new URL('../../../db/seeds/sample-games.pgn', import.meta.url), 'utf8');
  const { deps, store } = setup();
  const res = await seedFromPgn([sample], deps);
  assert.equal(res.imported, 3);
  assert.deepEqual(store.games.map((g) => g.result), ['1-0', '0-1', '1/2-1/2']);
});
