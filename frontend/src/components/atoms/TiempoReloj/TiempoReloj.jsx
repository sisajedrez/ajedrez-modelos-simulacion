import { formatearSegundos, formatearTiempo } from '../../../utils/formatearTiempo.js';

const TiempoReloj = ({ minutos = 0, segundos, vacio = false }) => {
  const textoTiempo = segundos !== undefined
    ? formatearSegundos(segundos)
    : formatearTiempo(minutos);

  return (
    <time
      aria-label={vacio ? 'Tiempo sin configurar' : `${textoTiempo}`}
      className={`reloj${vacio ? ' is-empty' : ''}`}
    >
      {textoTiempo}
    </time>
  );
};

export default TiempoReloj;
