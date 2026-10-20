import CampoTexto from '../../atoms/CampoTexto/index.js';
import TiempoReloj from '../../atoms/TiempoReloj/index.js';

const PlacaJugador = ({
  nombre,
  minutos,
  editable = false,
  onCambiarNombre,
  onTerminarNombre,
  etiqueta,
}) => (
  <div className="placa-jugador">
    {editable ? (
      <CampoTexto
        aria-label={etiqueta}
        className="nombre-jugador"
        maxLength={14}
        onBlur={onTerminarNombre}
        onChange={(event) => onCambiarNombre(event.target.value)}
        value={nombre}
      />
    ) : (
      <span className="nombre-jugador">{nombre}</span>
    )}
    <TiempoReloj minutos={minutos} vacio={minutos === 0} />
  </div>
);

export default PlacaJugador;
