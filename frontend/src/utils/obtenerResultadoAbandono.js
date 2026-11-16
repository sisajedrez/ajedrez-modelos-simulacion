const colorOpuesto = (color) => (color === 'w' ? 'b' : 'w');

export const obtenerResultadoAbandono = ({
  modo,
  jugadorRendido,
  nombres,
  rival,
  colorDePartida,
}) => {
  const jugadorUnoRendido = jugadorRendido.clave === 'jugadorUno';
  const ganador = jugadorUnoRendido
    ? (modo === 'jugador' ? nombres.jugadorDos || 'Jugador 2' : rival)
    : nombres.jugadorUno || 'Jugador 1';
  const colorGanador = jugadorUnoRendido
    ? colorOpuesto(colorDePartida)
    : colorDePartida;

  return {
    ganador,
    colorGanador,
    abandonante: jugadorRendido.nombre,
  };
};
