export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Position identity: placement, side to move, castling rights, en passant target.
// Halfmove/fullmove counters are dropped so equal positions compare equal.
export function normalizarFEN(fen) {
  if (typeof fen !== 'string') throw new TypeError('FEN must be a string');
  const fields = fen.trim().split(/\s+/);
  if (fields.length < 4) throw new Error('Invalid FEN: expected at least 4 fields');
  return fields.slice(0, 4).join(' ');
}

export function turnoDesdeFEN(fen) {
  return fen.trim().split(/\s+/)[1] === 'b' ? 'BLACK' : 'WHITE';
}
