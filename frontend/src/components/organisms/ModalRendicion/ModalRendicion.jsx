import Boton from '../../atoms/Boton/index.js';
import Modal from '../../atoms/Modal/index.js';

const ModalRendicion = ({ jugador, onConfirmar, onVolver }) => (
  <Modal
    onCerrar={onVolver}
    titulo={`¿Seguro que quieres rendirte, ${jugador}?`}
    variante="rendicion"
  >
    <div className="dialogo-acciones">
      <Boton className="dialogo-boton" onClick={onConfirmar}>
        Sí, me rindo.
      </Boton>
      <Boton className="dialogo-boton" onClick={onVolver}>
        Volver a la partida
      </Boton>
    </div>
  </Modal>
);

export default ModalRendicion;
