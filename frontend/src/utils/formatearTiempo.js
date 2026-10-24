export const formatearTiempo = (minutos, segundos = 0) =>
  `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;

export const formatearSegundos = (totalSegundos) => {
  const segs = Math.max(0, Math.floor(totalSegundos || 0));
  const mins = Math.floor(segs / 60);
  const rest = segs % 60;
  return formatearTiempo(mins, rest);
};
