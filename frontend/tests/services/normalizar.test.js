import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarDestinos,
  normalizarPartida,
  normalizarPerfiles,
  normalizarResultadoJugada,
} from '../../src/services/normalizar.js';

const dto = {
  id: '0b6f2f9e-3c53-4c37-9d1a-1f6d1d0f9b11',
  mode: 'STOCKFISH',
  status: 'EN_PROGRESO',
  result: null,
  fen: 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1',
  turn: 'BLACK',
  whitePlayerName: 'Stockfish',
  blackPlayerName: 'Lucía',
  whiteType: 'ENGINE',
  blackType: 'HUMAN',
  difficultyProfileId: 'p1',
  startedAt: '2026-10-20T12:00:00Z',
  endedAt: null,
};

describe('normalizarPartida', () => {
  it('lee el DTO de partida', () => {
    const partida = normalizarPartida(dto);
    assert.equal(partida.id, dto.id);
    assert.equal(partida.estado, 'EN_PROGRESO');
    assert.equal(partida.turno, 'b');
    assert.equal(partida.nombreBlancas, 'Stockfish');
    assert.deepEqual(partida.jugadas, []);
    assert.equal(partida.errorMotor, null);
  });

  it('lee la lista de jugadas del detalle', () => {
    const partida = normalizarPartida({
      ...dto,
      moves: [{ moveNumber: 1, color: 'WHITE', san: 'Nf3', fenBefore: 'a', fenAfter: 'b', timeSpentMs: 12 }],
    });
    assert.deepEqual(partida.jugadas, [{ san: 'Nf3', color: 'WHITE', fen: 'b' }]);
  });

  it('informa el error del motor al crear una partida con el motor de blancas', () => {
    const partida = normalizarPartida({ ...dto, engineError: { code: 'ENGINE_TIMEOUT', retryable: true } });
    assert.deepEqual(partida.errorMotor, { codigo: 'ENGINE_TIMEOUT', reintentable: true });
  });
});

describe('normalizarResultadoJugada', () => {
  it('lee una jugada del humano o del motor', () => {
    assert.deepEqual(
      normalizarResultadoJugada({
        valid: true, san: 'e4', fen: 'f', status: 'EN_PROGRESO', result: null, endReason: null,
      }),
      { valida: true, san: 'e4', fen: 'f', estado: 'EN_PROGRESO', resultado: null, motivo: null },
    );
  });

  it('lee el cierre por abandono (sin san ni fen)', () => {
    const r = normalizarResultadoJugada({ valid: true, status: 'FINALIZADA', result: '0-1', endReason: 'RESIGNATION' });
    assert.equal(r.estado, 'FINALIZADA');
    assert.equal(r.resultado, '0-1');
    assert.equal(r.motivo, 'RESIGNATION');
    assert.equal(r.san, undefined);
  });
});

describe('normalizarDestinos', () => {
  it('toma las casillas destino y no repite las de una coronación', () => {
    const respuesta = {
      square: 'a7',
      moves: [
        { from: 'a7', to: 'a8', san: 'a8=Q', promotion: 'q' },
        { from: 'a7', to: 'a8', san: 'a8=R', promotion: 'r' },
        { from: 'a7', to: 'b8', san: 'axb8=Q', promotion: 'q' },
      ],
    };
    assert.deepEqual(normalizarDestinos(respuesta), ['a8', 'b8']);
  });

  it('devuelve lista vacía si la pieza no tiene jugadas', () => {
    assert.deepEqual(normalizarDestinos({ square: 'a1', moves: [] }), []);
  });
});

describe('normalizarPerfiles', () => {
  it('usa el nombre del perfil (FACIL | MEDIO | DIFICIL) como valor', () => {
    assert.deepEqual(
      normalizarPerfiles([{ id: 'x', name: 'FACIL', skillLevel: 3, searchDepth: null, timeLimitMs: 1000 }]),
      [{ valor: 'FACIL', nombre: 'FACIL', nivelMotor: 3 }],
    );
  });
});
