import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatearTiempo } from '../../src/utils/formatearTiempo.js';
import { obtenerOpcionesFaltantes } from '../../src/utils/validarConfiguracion.js';

describe('formatearTiempo', () => {
  it('muestra minutos con dos dígitos', () => {
    assert.equal(formatearTiempo(5), '05:00');
    assert.equal(formatearTiempo(15), '15:00');
  });
});

describe('obtenerOpcionesFaltantes', () => {
  it('requiere modo, color y tiempo antes de comenzar', () => {
    assert.deepEqual(
      obtenerOpcionesFaltantes({ modo: '', dificultad: '', color: '', tiempo: '' }),
      ['modo', 'color', 'tiempo'],
    );
  });

  it('requiere dificultad contra la computadora, pero no entre jugadores', () => {
    assert.deepEqual(
      obtenerOpcionesFaltantes({ modo: 'stockfish', dificultad: '', color: 'w', tiempo: '10' }),
      ['dificultad'],
    );
    assert.deepEqual(
      obtenerOpcionesFaltantes({ modo: 'jugador', dificultad: '', color: 'w', tiempo: '10' }),
      [],
    );
  });
});
