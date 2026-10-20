import Boton from '../../atoms/Boton/index.js';
import Titulo from '../../atoms/Titulo/index.js';
import Texto from '../../atoms/Texto/index.js';
import Tablero from '../Tablero/index.js';

const MenuPrincipal = ({ onNuevaPartida }) => (
  <div className="menu-principal">
    <Tablero clase="tablero-decorativo" />
    <div className="menu-principal__contenido">
      <Texto as="p" className="menu-principal__bienvenida">¡Bienvenido!</Texto>
      <Titulo className="menu-principal__titulo" />
      <Boton className="menu-principal__accion" onClick={onNuevaPartida} variante="vidrio">
        Nueva partida
      </Boton>
    </div>
  </div>
);

export default MenuPrincipal;
