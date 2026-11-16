import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tablero } from '../../src/domain/Tablero.js';
import { normalizarFEN, START_FEN } from '../../src/domain/fen.js';

const play = (t, ...moves) => {
  for (const m of moves) {
    const [from, to, promotion] = [m.slice(0, 2), m.slice(2, 4), m.slice(4) || undefined];
    const r = t.jugar({ from, to, promotion });
    assert.ok(r.legal, `expected ${m} to be legal`);
  }
};

test('a pinned piece cannot move and leave its own king in check', () => {
  // Black Re8 pins the white Re2 against the white king on e1.
  const t = new Tablero('4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1');
  const before = t.fen();
  assert.equal(t.jugar({ from: 'e2', to: 'a2' }).legal, false);
  assert.equal(t.fen(), before);
  assert.equal(t.jugar({ from: 'e2', to: 'e5' }).legal, true);
});

test('king cannot move into an attacked square', () => {
  const t = new Tablero('4k3/8/8/8/8/8/r7/4K3 w - - 0 1');
  assert.equal(t.validarMovimientoLegal({ from: 'e1', to: 'e2' }).legal, false);
});

test('castling is allowed when path is clear and safe', () => {
  const t = new Tablero('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const k = t.jugar({ from: 'e1', to: 'g1' });
  assert.equal(k.legal, true);
  assert.equal(k.san, 'O-O');
  const q = t.jugar({ from: 'e8', to: 'c8' });
  assert.equal(q.san, 'O-O-O');
});

test('castling is blocked after the king has moved', () => {
  const t = new Tablero('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  play(t, 'e1e2', 'a8a7', 'e2e1', 'a7a8');
  assert.equal(t.validarMovimientoLegal({ from: 'e1', to: 'g1' }).legal, false);
  assert.equal(t.validarMovimientoLegal({ from: 'e1', to: 'c1' }).legal, false);
});

test('castling is blocked when the king passes through an attacked square', () => {
  // Black rook on f8 attacks f1: white cannot castle kingside.
  const t = new Tablero('4kr2/8/8/8/8/8/8/4K2R w K - 0 1');
  assert.equal(t.validarMovimientoLegal({ from: 'e1', to: 'g1' }).legal, false);
});

test('castling is blocked while in check', () => {
  const t = new Tablero('4r1k1/8/8/8/8/8/8/4K2R w K - 0 1');
  assert.equal(t.validarMovimientoLegal({ from: 'e1', to: 'g1' }).legal, false);
});

test('en passant is legal only on the immediate turn', () => {
  const t = new Tablero();
  play(t, 'e2e4', 'a7a6', 'e4e5', 'd7d5');
  const ep = t.validarMovimientoLegal({ from: 'e5', to: 'd6' });
  assert.equal(ep.legal, true);
  assert.equal(ep.san, 'exd6');

  const late = new Tablero();
  play(late, 'e2e4', 'a7a6', 'e4e5', 'd7d5', 'h2h3', 'h7h6');
  assert.equal(late.validarMovimientoLegal({ from: 'e5', to: 'd6' }).legal, false);
});

for (const [piece, suffix] of [['q', '=Q'], ['r', '=R'], ['b', '=B'], ['n', '=N']]) {
  test(`pawn promotes to ${piece}`, () => {
    const t = new Tablero('8/P6k/8/8/8/8/8/K7 w - - 0 1');
    const r = t.jugar({ from: 'a7', to: 'a8', promotion: piece });
    assert.equal(r.legal, true);
    assert.ok(r.san.includes(suffix), `${r.san} should include ${suffix}`);
  });
}

test('promotion without a piece, or with an invalid one, is illegal', () => {
  const t = new Tablero('8/P6k/8/8/8/8/8/K7 w - - 0 1');
  const before = t.fen();
  assert.equal(t.jugar({ from: 'a7', to: 'a8' }).legal, false);
  assert.equal(t.jugar({ from: 'a7', to: 'a8', promotion: 'k' }).legal, false);
  assert.equal(t.jugar({ from: 'a7', to: 'a8', promotion: 'p' }).legal, false);
  assert.equal(t.fen(), before);
});

test('promotion on a non-promoting move is illegal', () => {
  const t = new Tablero();
  assert.equal(t.jugar({ from: 'e2', to: 'e4', promotion: 'q' }).legal, false);
});

test('illegal input never throws', () => {
  const t = new Tablero();
  assert.equal(t.jugar({ from: 'e4', to: 'e5' }).legal, false);
  assert.equal(t.jugar({ from: 'e2', to: 'e5' }).legal, false);
  assert.equal(t.jugar({}).legal, false);
});

test('legal move returns san, fens and color without side effects on illegal', () => {
  const t = new Tablero();
  const r = t.jugar({ from: 'e2', to: 'e4' });
  assert.equal(r.legal, true);
  assert.equal(r.san, 'e4');
  assert.equal(r.color, 'WHITE');
  assert.equal(r.fenBefore, START_FEN);
  assert.equal(r.fenAfter, t.fen());
  assert.equal(r.moveNumber, 1);
  assert.equal(t.turno(), 'BLACK');
  assert.equal(t.numeroJugada(), 1);
  play(t, 'e7e5');
  assert.equal(t.numeroJugada(), 2);
});

test('movimientosLegales lists moves for a square, with promotions', () => {
  const t = new Tablero();
  const moves = t.movimientosLegales('e2');
  assert.deepEqual(moves.map((m) => m.to).sort(), ['e3', 'e4']);
  assert.deepEqual(t.movimientosLegales('e5'), []);
  const p = new Tablero('8/P6k/8/8/8/8/8/K7 w - - 0 1').movimientosLegales('a7');
  assert.deepEqual(p.map((m) => m.promotion).sort(), ['b', 'n', 'q', 'r']);
});

test("fool's mate is checkmate won by black", () => {
  const t = new Tablero();
  play(t, 'f2f3', 'e7e5', 'g2g4', 'd8h4');
  assert.deepEqual(t.estadoFinal(), { result: '0-1', endReason: 'CHECKMATE' });
});

test('checkmate by white gives 1-0', () => {
  const t = new Tablero();
  play(t, 'e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7');
  assert.deepEqual(t.estadoFinal(), { result: '1-0', endReason: 'CHECKMATE' });
});

test('stalemate is a draw', () => {
  const t = new Tablero('7k/8/4Q1K1/8/8/8/8/8 w - - 0 1');
  assert.equal(t.estadoFinal(), null);
  play(t, 'e6f7');
  assert.deepEqual(t.estadoFinal(), { result: '1/2-1/2', endReason: 'STALEMATE' });
});

test('threefold repetition is a draw', () => {
  const t = new Tablero();
  play(t, 'g1f3', 'g8f6', 'f3g1', 'f6g8');
  assert.equal(t.estadoFinal(), null);
  play(t, 'g1f3', 'g8f6', 'f3g1', 'f6g8');
  assert.deepEqual(t.estadoFinal(), { result: '1/2-1/2', endReason: 'THREEFOLD_REPETITION' });
});

test('fifty-move rule triggers after a quiet move at halfmove 99', () => {
  const t = new Tablero('4k3/8/8/8/8/8/8/R3K3 w - - 99 80');
  assert.equal(t.estadoFinal(), null);
  play(t, 'a1a2');
  assert.deepEqual(t.estadoFinal(), { result: '1/2-1/2', endReason: 'FIFTY_MOVE_RULE' });
});

test('insufficient material is a draw', () => {
  const t = new Tablero('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
  assert.deepEqual(t.estadoFinal(), { result: '1/2-1/2', endReason: 'INSUFFICIENT_MATERIAL' });
  const kn = new Tablero('4k3/8/8/8/8/8/8/3NK3 w - - 0 1');
  assert.equal(kn.estadoFinal().endReason, 'INSUFFICIENT_MATERIAL');
});

test('desdeHistorial preserves repetition history', () => {
  const sans = ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'];
  const t = Tablero.desdeHistorial(sans);
  assert.deepEqual(t.estadoFinal(), { result: '1/2-1/2', endReason: 'THREEFOLD_REPETITION' });
  assert.equal(t.turno(), 'WHITE');
  assert.equal(t.numeroJugada(), 5);
});

test('desdeHistorial of an empty list is the start position', () => {
  assert.equal(Tablero.desdeHistorial([]).fen(), START_FEN);
});

test('normalizarFEN keeps the first four fields only', () => {
  assert.equal(
    normalizarFEN('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'),
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3',
  );
  assert.equal(normalizarFEN(START_FEN), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
  assert.throws(() => normalizarFEN('8/8 w'));
});
