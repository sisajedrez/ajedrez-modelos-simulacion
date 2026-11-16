import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tablero } from '../../src/domain/Tablero.js';

test('aPGN writes headers in order, movetext and result', () => {
  const pgn = Tablero.aPGN(['e4', 'e5', 'Nf3'], {
    Event: 'UNViMe Chess',
    White: 'Ana',
    Black: 'Bo',
    Result: '*',
  });
  assert.match(pgn, /^\[Event "UNViMe Chess"\]/);
  assert.match(pgn, /\[White "Ana"\]/);
  assert.match(pgn, /1\. e4 e5 2\. Nf3 \*$/);
});

test('aPGN strips quotes and line breaks from header values', () => {
  const pgn = Tablero.aPGN(['e4'], { White: 'A"B\nC', Result: '*' });
  assert.doesNotMatch(pgn, /A"B/);
  assert.match(pgn, /\[White "A'B C"\]/);
});

test('aPGN rejects an illegal SAN sequence', () => {
  assert.throws(() => Tablero.aPGN(['e4', 'e4']));
});

test('desdePGN returns headers, SANs, per-move FENs, final position and state', () => {
  const r = Tablero.desdePGN('[White "A"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
  assert.equal(r.headers.White, 'A');
  assert.deepEqual(r.sans, ['f3', 'e5', 'g4', 'Qh4#']);
  assert.deepEqual(r.moves.map((m) => m.moveNumber), [1, 1, 2, 2]);
  assert.deepEqual(r.moves.map((m) => m.color), ['WHITE', 'BLACK', 'WHITE', 'BLACK']);
  assert.equal(r.moves[1].fenBefore, r.moves[0].fenAfter);
  assert.equal(r.fen, r.moves.at(-1).fenAfter);
  assert.deepEqual(r.finalState, { result: '0-1', endReason: 'CHECKMATE' });
});

test('desdePGN reports null finalState for an ongoing game and throws on bad input', () => {
  assert.equal(Tablero.desdePGN('1. e4 e5 *').finalState, null);
  assert.throws(() => Tablero.desdePGN('garbage'));
  assert.throws(() => Tablero.desdePGN('1. e4 e5 2. Ke5 *'));
  assert.throws(() => Tablero.desdePGN('[Event "x"]\n\n*'), /no moves/);
});
