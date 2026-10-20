const ETIQUETAS = { FACIL: 'Fácil', MEDIO: 'Medio', DIFICIL: 'Difícil' };
const CLASES = { FACIL: 'opcion--facil', MEDIO: 'opcion--medio', DIFICIL: 'opcion--dificil' };

export const nivelesDesdePerfiles = (perfiles) => {
  const vistos = new Set();
  return perfiles
    .filter((perfil) => {
      if (vistos.has(perfil.valor)) return false;
      vistos.add(perfil.valor);
      return true;
    })
    .map((perfil) => ({
      valor: perfil.valor,
      etiqueta: ETIQUETAS[perfil.nombre] ?? perfil.nombre,
      clase: CLASES[perfil.nombre] ?? '',
    }));
};
