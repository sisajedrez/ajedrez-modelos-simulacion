import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mensajeDeError } from '../../src/utils/mensajesError.js';

describe('mensajeDeError', () => {
  it('traduce los códigos conocidos del backend', () => {
    assert.equal(mensajeDeError({ codigo: 'ILLEGAL_MOVE' }), 'Esa jugada no es legal.');
    assert.equal(mensajeDeError({ codigo: 'ENGINE_TIMEOUT' }), 'Stockfish no respondió a tiempo.');
  });

  it('usa el mensaje del servidor si el código no se conoce', () => {
    assert.equal(mensajeDeError({ codigo: 'RARO', message: 'Algo pasó' }), 'Algo pasó');
  });

  it('tiene un mensaje por defecto', () => {
    assert.equal(mensajeDeError(undefined), 'Ocurrió un error inesperado.');
  });
});
