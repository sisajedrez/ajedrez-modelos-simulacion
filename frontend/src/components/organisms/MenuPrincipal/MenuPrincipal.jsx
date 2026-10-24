import Boton from '../../atoms/Boton/index.js';
import Titulo from '../../atoms/Titulo/index.js';
import Texto from '../../atoms/Texto/index.js';
import Tablero from '../Tablero/index.js';

const MenuPrincipal = ({ onNuevaPartida, onHistorialPartidas }) => (
  <div className="menu-principal">
    <Tablero clase="tablero-decorativo" />
    <div className="menu-principal__contenido">
      <Texto as="p" className="menu-principal__bienvenida">¡Bienvenido!</Texto>
      <Titulo className="menu-principal__titulo" />
      <div className="menu-principal__acciones" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Boton className="menu-principal__accion" onClick={onNuevaPartida} variante="vidrio">
          Nueva partida
        </Boton>
        <Boton className="menu-principal__accion" onClick={onHistorialPartidas} variante="vidrio">
          Historial de partidas
        </Boton>
      </div>
    </div>
  </div>
);

export default MenuPrincipal;
