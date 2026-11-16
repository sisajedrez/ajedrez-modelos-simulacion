import Boton from '../../atoms/Boton/index.js';
import Modal from '../../atoms/Modal/index.js';

const ModalResultado = ({ resultado, onRevisar, onMenu }) => (
  <Modal
    onCerrar={onRevisar}
    titulo={resultado.titulo}
    variante={resultado.tipo === 'victoria' ? 'victoria' : 'rendicion'}
  >
    <p className="dialogo-mensaje">{resultado.mensaje}</p>
    <div className="dialogo-acciones">
      <Boton className="dialogo-boton" onClick={onRevisar}>
        Revisar partida
      </Boton>
      <Boton className="dialogo-boton" onClick={onMenu}>
        Menú principal
      </Boton>
    </div>
    <p className="dialogo-id">ID de partida: {resultado.idPartida ?? 'No disponible'}</p>
  </Modal>
);

export default ModalResultado;
