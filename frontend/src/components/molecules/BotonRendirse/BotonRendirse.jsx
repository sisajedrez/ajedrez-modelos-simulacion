import Boton from '../../atoms/Boton/index.js';
import Icono from '../../atoms/Icono/index.js';

const BotonRendirse = ({ nombreJugador, onRendirse }) => (
  <Boton
    aria-label={`Rendirse: ${nombreJugador}`}
    className="boton-rendirse"
    onClick={onRendirse}
    type="button"
  >
    <Icono>🏳</Icono>
  </Boton>
);

export default BotonRendirse;
