import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crearPartidasApi } from '../../src/services/partidasApi.js';

const clienteFalso = (respuesta) => {
  const llamadas = [];
  return {
    llamadas,
    get: async (ruta, consulta) => { llamadas.push(['GET', ruta, consulta]); return respuesta; },
    post: async (ruta, cuerpo) => { llamadas.push(['POST', ruta, cuerpo]); return respuesta; },
  };
};

describe('partidasApi', () => {
  it('crea la partida con los valores traducidos del contrato POST /games', async () => {
    const cliente = clienteFalso({ id: 'g1', fen: 'x w - - 0 1', status: 'EN_PROGRESO', turn: 'WHITE' });
    const api = crearPartidasApi(cliente);
    const partida = await api.crearPartida({ modo: 'stockfish', alias: 'Lucía', dificultad: 'FACIL', color: 'b' });
    assert.deepEqual(cliente.llamadas[0], ['POST', '/games', {
      mode: 'STOCKFISH', alias: 'Lucía', difficulty: 'FACIL', playerColor: 'BLACK',
    }]);
    assert.equal(partida.id, 'g1');
    assert.equal(partida.estado, 'EN_PROGRESO');
  });

  it('omite la dificultad en partidas locales', async () => {
    const cliente = clienteFalso({ id: 'g1' });
    await crearPartidasApi(cliente).crearPartida({ modo: 'jugador', alias: 'A', dificultad: '', color: 'w' });
    assert.equal(cliente.llamadas[0][2].difficulty, undefined);
    assert.equal(cliente.llamadas[0][2].mode, 'LOCAL');
  });

  it('envía la jugada con promoción solo cuando corresponde', async () => {
    const cliente = clienteFalso({ valid: true, san: 'a8=Q', fen: 'f', status: 'EN_PROGRESO' });
    const api = crearPartidasApi(cliente);
    const resultado = await api.enviarJugada('g1', { desde: 'a7', hasta: 'a8', coronacion: 'q' });
    await api.enviarJugada('g1', { desde: 'e2', hasta: 'e4' });
    assert.deepEqual(cliente.llamadas[0], ['POST', '/games/g1/moves', { from: 'a7', to: 'a8', promotion: 'q' }]);
    assert.deepEqual(cliente.llamadas[1][2], { from: 'e2', to: 'e4' });
    assert.deepEqual(resultado, {
      valida: true, san: 'a8=Q', fen: 'f', estado: 'EN_PROGRESO', resultado: null, motivo: null,
    });
  });

  it('lee los destinos del formato real { square, moves }', async () => {
    const api = crearPartidasApi(clienteFalso({
      square: 'e2', moves: [{ from: 'e2', to: 'e3', san: 'e3' }, { from: 'e2', to: 'e4', san: 'e4' }],
    }));
    assert.deepEqual(await api.obtenerDestinos('g1', 'e2'), ['e3', 'e4']);
  });

  it('usa los endpoints de turno de la máquina, abandono, pausa y reanudación', async () => {
    const cliente = clienteFalso({});
    const api = crearPartidasApi(cliente);
    await api.jugarMaquina('g1');
    const abandono = await api.rendirse('g1', 'w');
    await api.pausar('g1');
    await api.reanudar('g1');
    assert.deepEqual(cliente.llamadas.map(([m, ruta]) => `${m} ${ruta}`), [
      'POST /games/g1/engine-move',
      'POST /games/g1/resign',
      'POST /games/g1/pause',
      'POST /games/g1/resume',
    ]);
    assert.deepEqual(cliente.llamadas[1][2], { color: 'WHITE' });
    assert.equal(abandono.estado, undefined);
  });

  it('lee los perfiles de dificultad', async () => {
    const api = crearPartidasApi(clienteFalso([{ id: 'u', name: 'FACIL', skillLevel: 3 }]));
    assert.deepEqual(await api.obtenerPerfiles(), [{ valor: 'FACIL', nombre: 'FACIL', nivelMotor: 3 }]);
  });

  it('lee el detalle de una partida con su lista de jugadas', async () => {
    const api = crearPartidasApi(clienteFalso({
      id: 'g1', fen: 'f', status: 'FINALIZADA', result: '1-0', turn: 'BLACK',
      moves: [{ san: 'e4', color: 'WHITE', fenAfter: 'a' }, { san: 'e5', color: 'BLACK', fenAfter: 'b' }],
    }));
    const partida = await api.obtenerPartida('g1');
    assert.equal(partida.resultado, '1-0');
    assert.deepEqual(partida.jugadas.map((j) => j.san), ['e4', 'e5']);
  });
});
