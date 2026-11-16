import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nivelesDesdePerfiles } from '../../src/utils/niveles.js';

const perfiles = [
  { valor: 'FACIL', nombre: 'FACIL' },
  { valor: 'MEDIO', nombre: 'MEDIO' },
  { valor: 'DIFICIL', nombre: 'DIFICIL' },
];

describe('nivelesDesdePerfiles', () => {
  it('conserva el nombre del perfil como valor a enviar y muestra etiquetas en español', () => {
    assert.deepEqual(nivelesDesdePerfiles(perfiles), [
      { valor: 'FACIL', etiqueta: 'Fácil', clase: 'opcion--facil' },
      { valor: 'MEDIO', etiqueta: 'Medio', clase: 'opcion--medio' },
      { valor: 'DIFICIL', etiqueta: 'Difícil', clase: 'opcion--dificil' },
    ]);
  });

  it('no repite perfiles', () => {
    assert.equal(nivelesDesdePerfiles([...perfiles, perfiles[0]]).length, 3);
  });

  it('muestra un perfil desconocido con su nombre y sin clase de color', () => {
    assert.deepEqual(nivelesDesdePerfiles([{ valor: 'EXPERTO', nombre: 'EXPERTO' }]), [
      { valor: 'EXPERTO', etiqueta: 'EXPERTO', clase: '' },
    ]);
  });
});
