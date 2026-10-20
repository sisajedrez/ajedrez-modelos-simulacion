import Boton from '../../atoms/Boton/index.js';
import Modal from '../../atoms/Modal/index.js';

const piezas = [
  { valor: 'q', etiqueta: 'Dama', blanca: '♕', negra: '♛' },
  { valor: 'r', etiqueta: 'Torre', blanca: '♖', negra: '♜' },
  { valor: 'b', etiqueta: 'Alfil', blanca: '♗', negra: '♝' },
  { valor: 'n', etiqueta: 'Caballo', blanca: '♘', negra: '♞' },
];

const ModalPromocion = ({ color = 'w', onElegir, onCancelar }) => (
  <Modal onCerrar={onCancelar} titulo="Coronación: elegí una pieza" variante="rendicion">
    <div className="dialogo-acciones">
      {piezas.map(({ valor, etiqueta, blanca, negra }) => (
        <Boton className="dialogo-boton" key={valor} onClick={() => onElegir(valor)}>
          {color === 'w' ? blanca : negra} {etiqueta}
        </Boton>
      ))}
      <Boton className="dialogo-boton" onClick={onCancelar}>
        Cancelar jugada
      </Boton>
    </div>
  </Modal>
);

export default ModalPromocion;
