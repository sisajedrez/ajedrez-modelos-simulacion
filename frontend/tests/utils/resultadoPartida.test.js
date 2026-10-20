import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { construirResultado, describirMotivo, ganadorDesdeResultado } from '../../src/utils/resultadoPartida.js';

const nombres = { w: 'Lucía', b: 'Stockfish' };

describe('resultadoPartida', () => {
  it('interpreta el resultado en notación PGN y en texto', () => {
    assert.equal(ganadorDesdeResultado('1-0'), 'w');
    assert.equal(ganadorDesdeResultado('0-1'), 'b');
    assert.equal(ganadorDesdeResultado('1/2-1/2'), 'tablas');
    assert.equal(ganadorDesdeResultado('WHITE'), 'w');
    assert.equal(ganadorDesdeResultado('BLACK_WINS'), 'b');
    assert.equal(ganadorDesdeResultado(null), null);
  });

  it('traduce el motivo de cierre', () => {
    assert.equal(describirMotivo('CHECKMATE'), 'jaque mate');
    assert.equal(describirMotivo('stalemate'), 'rey ahogado');
    assert.equal(describirMotivo('RESIGNATION'), 'abandono');
    assert.equal(describirMotivo('THREEFOLD_REPETITION'), 'triple repetición');
    assert.equal(describirMotivo('algo raro'), null);
  });

  it('muestra el abandono con el nombre de quien se rindió', () => {
    assert.deepEqual(
      construirResultado({ resultado: '0-1', motivo: 'RESIGNATION', nombres, idPartida: 'abc' }),
      { tipo: 'victoria', titulo: '¡Stockfish (Negras) gana!', mensaje: 'por abandono de Lucía', idPartida: 'abc' },
    );
  });

  it('muestra el jaque mate (no "abandono")', () => {
    const resultado = construirResultado({ resultado: '1-0', motivo: 'CHECKMATE', nombres, idPartida: 'x' });
    assert.equal(resultado.titulo, '¡Lucía (Blancas) gana!');
    assert.equal(resultado.mensaje, 'por jaque mate');
  });

  it('muestra las tablas con su motivo', () => {
    const resultado = construirResultado({ resultado: '1/2-1/2', motivo: 'STALEMATE', nombres, idPartida: 'x' });
    assert.equal(resultado.tipo, 'tablas');
    assert.equal(resultado.mensaje, 'por rey ahogado');
  });
});
