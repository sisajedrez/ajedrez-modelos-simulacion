import Boton from '../../atoms/Boton/index.js';
import Modal from '../../atoms/Modal/index.js';

const ModalAviso = ({ titulo, mensaje, acciones, onCerrar }) => (
  <Modal onCerrar={onCerrar} titulo={titulo} variante="rendicion">
    {mensaje && <p className="dialogo-mensaje">{mensaje}</p>}
    <div className="dialogo-acciones">
      {acciones.map(({ etiqueta, onClick }) => (
        <Boton className="dialogo-boton" key={etiqueta} onClick={onClick}>
          {etiqueta}
        </Boton>
      ))}
    </div>
  </Modal>
);

export default ModalAviso;
