import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { obtenerResultadoAbandono } from '../../src/utils/obtenerResultadoAbandono.js';

const nombres = { jugadorUno: 'Lucía', jugadorDos: 'Mateo' };

describe('obtenerResultadoAbandono', () => {
  it('declara ganador al otro jugador y le asigna el color correcto', () => {
    assert.deepEqual(
      obtenerResultadoAbandono({
        modo: 'jugador',
        jugadorRendido: { clave: 'jugadorUno', nombre: 'Lucía' },
        nombres,
        rival: 'Mateo',
        colorDePartida: 'w',
      }),
      { ganador: 'Mateo', colorGanador: 'b', abandonante: 'Lucía' },
    );
  });

  it('identifica al jugador uno como ganador cuando se rinde el jugador dos', () => {
    assert.deepEqual(
      obtenerResultadoAbandono({
        modo: 'jugador',
        jugadorRendido: { clave: 'jugadorDos', nombre: 'Mateo' },
        nombres,
        rival: 'Mateo',
        colorDePartida: 'b',
      }),
      { ganador: 'Lucía', colorGanador: 'b', abandonante: 'Mateo' },
    );
  });

  it('declara ganador al motor cuando se rinde el jugador humano', () => {
    assert.deepEqual(
      obtenerResultadoAbandono({
        modo: 'stockfish',
        jugadorRendido: { clave: 'jugadorUno', nombre: 'Lucía' },
        nombres,
        rival: 'Stockfish',
        colorDePartida: 'b',
      }),
      { ganador: 'Stockfish', colorGanador: 'w', abandonante: 'Lucía' },
    );
  });
});
