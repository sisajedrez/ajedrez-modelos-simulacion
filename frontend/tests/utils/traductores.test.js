import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  colorAApi,
  colorDesdeApi,
  esCoronacion,
  modoAApi,
  piezaEnCasilla,
  turnoDesdeFen,
} from '../../src/utils/traductores.js';

const INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('traductores de valores UI ↔ API', () => {
  it('traduce el modo a los valores del enum game_mode', () => {
    assert.equal(modoAApi('jugador'), 'LOCAL');
    assert.equal(modoAApi('stockfish'), 'STOCKFISH');
    assert.equal(modoAApi('unvime'), 'AI');
    assert.equal(modoAApi('otro'), undefined);
  });

  it('traduce el color a piece_color y de vuelta', () => {
    assert.equal(colorAApi('w'), 'WHITE');
    assert.equal(colorAApi('b'), 'BLACK');
    assert.equal(colorDesdeApi('BLACK'), 'b');
    assert.equal(colorDesdeApi('WHITE'), 'w');
  });

  it('lee el turno activo del FEN', () => {
    assert.equal(turnoDesdeFen(INICIAL), 'w');
    assert.equal(turnoDesdeFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'), 'b');
  });

  it('encuentra la pieza de una casilla', () => {
    assert.equal(piezaEnCasilla(INICIAL, 'e1'), 'K');
    assert.equal(piezaEnCasilla(INICIAL, 'd8'), 'q');
    assert.equal(piezaEnCasilla(INICIAL, 'e4'), null);
    assert.equal(piezaEnCasilla(INICIAL, 'a2'), 'P');
  });

  it('detecta la coronación solo para peones que llegan a la última fila', () => {
    const fen = '8/P6k/8/8/8/8/p6K/8 w - - 0 1';
    assert.equal(esCoronacion(fen, 'a7', 'a8'), true);
    assert.equal(esCoronacion(fen, 'a2', 'a1'), true);
    assert.equal(esCoronacion(INICIAL, 'e2', 'e4'), false);
    assert.equal(esCoronacion(fen, 'h7', 'h6'), false);
  });
});
