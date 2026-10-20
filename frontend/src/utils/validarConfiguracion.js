export const obtenerOpcionesFaltantes = ({ modo, dificultad, color, tiempo }) => {
  const faltantes = [];

  if (!modo) faltantes.push('modo');
  if (modo && modo !== 'jugador' && !dificultad) faltantes.push('dificultad');
  if (!color) faltantes.push('color');
  if (!tiempo) faltantes.push('tiempo');

  return faltantes;
};
