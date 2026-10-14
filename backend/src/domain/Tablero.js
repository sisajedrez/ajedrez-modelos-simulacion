import { Chess } from 'chess.js';
import { START_FEN } from './fen.js';

const PROMOTIONS = new Set(['q', 'r', 'b', 'n']);

// Facade over chess.js. This is the only module allowed to import it.
export class Tablero {
  #chess;

  constructor(fen = START_FEN) {
    this.#chess = new Chess(fen);
  }

  // Replays SAN moves from the initial position so repetition history is kept.
  static desdeHistorial(sanList) {
    const tablero = new Tablero();
    for (const san of sanList) tablero.#chess.move(san);
    return tablero;
  }

  // Builds PGN text from a SAN history. `headers` is an ordered { tag: value } map;
  // quotes and line breaks are stripped from values so the tag pairs stay well formed.
  // Throws if a SAN is not legal in sequence.
  static aPGN(sanList, headers = {}) {
    const chess = new Chess();
    for (const [tag, value] of Object.entries(headers)) {
      chess.setHeader(tag, String(value).replace(/"/g, "'").replace(/\s+/g, ' ').trim());
    }
    for (const san of sanList) chess.move(san);
    const pgn = chess.pgn();
    // With no moves chess.js omits the blank line between tags and the result token.
    return sanList.length === 0 ? pgn.replace(/\n\s*([^\s\]]+)$/, '\n\n$1') : pgn;
  }

  // Parses PGN text (single game) replayed from the standard start position.
  // Returns { headers, sans, moves, fen, finalState }; throws Error on any parse/legality problem.
  static desdePGN(pgn) {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const headers = chess.getHeaders();
    if (headers.FEN || headers.SetUp === '1') {
      throw new Error('PGN with a custom starting position is not supported');
    }
    const history = chess.history({ verbose: true });
    if (history.length === 0) throw new Error('PGN contains no moves');
    const moves = history.map((m, i) => ({
      moveNumber: Math.floor(i / 2) + 1,
      color: m.color === 'w' ? 'WHITE' : 'BLACK',
      san: m.san,
      fenBefore: m.before,
      fenAfter: m.after,
    }));
    const tablero = Tablero.desdeHistorial(moves.map((m) => m.san));
    return {
      headers,
      sans: moves.map((m) => m.san),
      moves,
      fen: tablero.fen(),
      finalState: tablero.estadoFinal(),
    };
  }

  fen() {
    return this.#chess.fen();
  }

  turno() {
    return this.#chess.turn() === 'w' ? 'WHITE' : 'BLACK';
  }

  numeroJugada() {
    return this.#chess.moveNumber();
  }

  #buscar({ from, to, promotion }) {
    if (promotion !== undefined && !PROMOTIONS.has(promotion)) return null;
    const candidatos = this.#chess.moves({ square: from, verbose: true });
    return candidatos.find((m) => m.to === to && m.promotion === promotion) ?? null;
  }

  // Never mutates the board.
  validarMovimientoLegal(movimiento) {
    const m = this.#buscar(movimiento ?? {});
    if (!m) return { legal: false };
    return {
      legal: true,
      san: m.san,
      fenBefore: m.before,
      fenAfter: m.after,
      color: m.color === 'w' ? 'WHITE' : 'BLACK',
    };
  }

  // Applies a legal move and returns its data; returns { legal: false } otherwise.
  jugar(movimiento) {
    const info = this.validarMovimientoLegal(movimiento);
    if (!info.legal) return info;
    const numero = this.numeroJugada();
    const { from, to, promotion } = movimiento;
    this.#chess.move({ from, to, promotion });
    return { ...info, moveNumber: numero };
  }

  movimientosLegales(square) {
    return this.#chess.moves({ square, verbose: true }).map((m) => {
      const out = { from: m.from, to: m.to, san: m.san };
      if (m.promotion) out.promotion = m.promotion;
      return out;
    });
  }

  estadoFinal() {
    const c = this.#chess;
    if (c.isCheckmate()) {
      return { result: c.turn() === 'w' ? '0-1' : '1-0', endReason: 'CHECKMATE' };
    }
    if (c.isStalemate()) return { result: '1/2-1/2', endReason: 'STALEMATE' };
    if (c.isInsufficientMaterial()) return { result: '1/2-1/2', endReason: 'INSUFFICIENT_MATERIAL' };
    if (c.isThreefoldRepetition()) return { result: '1/2-1/2', endReason: 'THREEFOLD_REPETITION' };
    if (c.isDrawByFiftyMoves()) return { result: '1/2-1/2', endReason: 'FIFTY_MOVE_RULE' };
    return null;
  }
}
