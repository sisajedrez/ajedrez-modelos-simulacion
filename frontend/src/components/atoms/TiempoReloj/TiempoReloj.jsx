import { formatearTiempo } from '../../../utils/formatearTiempo.js';

const TiempoReloj = ({ minutos = 0, vacio = false }) => (
  <time
    aria-label={vacio ? 'Tiempo sin configurar' : `${minutos} minutos`}
    className={`reloj${vacio ? ' is-empty' : ''}`}
  >
    {formatearTiempo(minutos)}
  </time>
);

export default TiempoReloj;
