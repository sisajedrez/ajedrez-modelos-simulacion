import BotonOpcion from '../../atoms/BotonOpcion/index.js';
import Texto from '../../atoms/Texto/index.js';

const GrupoOpciones = ({
  titulo,
  opciones,
  valor,
  deshabilitado = false,
  onSeleccionar,
}) => (
  <fieldset className={`grupo-opciones${deshabilitado ? ' is-disabled' : ''}`} disabled={deshabilitado}>
    <legend><Texto as="span">{titulo}</Texto></legend>
    <div className="fila-opciones">
      {opciones.map(({ valor: valorOpcion, etiqueta, clase = '' }) => (
        <BotonOpcion
          className={clase}
          key={valorOpcion}
          onClick={() => onSeleccionar(valorOpcion)}
          seleccionada={valor === valorOpcion}
          atenuada={Boolean(valor) && valor !== valorOpcion}
          type="button"
        >
          {etiqueta}
        </BotonOpcion>
      ))}
    </div>
  </fieldset>
);

export default GrupoOpciones;
