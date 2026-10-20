import Boton from '../../atoms/Boton/index.js';
import GrupoOpciones from '../../molecules/GrupoOpciones/index.js';
import Texto from '../../atoms/Texto/index.js';

const grupos = [
  {
    clave: 'modo',
    titulo: 'Modo de partida',
    valores: [
      { valor: 'jugador', etiqueta: 'vs Jugador' },
      { valor: 'stockfish', etiqueta: 'vs Stockfish' },
      { valor: 'unvime', etiqueta: 'vs IA UNViMe' },
    ],
  },
  {
    clave: 'color',
    titulo: 'Color de piezas',
    valores: [
      { valor: 'w', etiqueta: 'Blancas', clase: 'opcion--blancas' },
      { valor: 'b', etiqueta: 'Negras', clase: 'opcion--negras' },
      { valor: 'r', etiqueta: 'Aleatorio' },
    ],
  },
  {
    clave: 'tiempo',
    titulo: 'Tiempo de partida',
    valores: [
      { valor: '10', etiqueta: '10 min' },
      { valor: '15', etiqueta: '15 min' },
      { valor: '20', etiqueta: '20 min' },
    ],
  },
];

const PanelConfiguracion = ({
  configuracion,
  elementosFaltantes,
  niveles = [],
  errorNiveles = '',
  ocupado = false,
  onSeleccionar,
  onVolver,
  onComenzar,
}) => {
  const esPartidaLocal = configuracion.modo === 'jugador';
  const [grupoModo, ...restoGrupos] = grupos;
  const grupoDificultad = {
    clave: 'dificultad',
    titulo: 'Nivel de dificultad',
    valores: niveles,
  };

  return (
    <div className="panel-configuracion">
      <h1>Ajedrez UNViMe</h1>
      <div className="panel-configuracion__opciones">
        {[grupoModo, grupoDificultad, ...restoGrupos].map(({ clave, titulo, valores }) => (
          <GrupoOpciones
            deshabilitado={clave === 'dificultad' && (esPartidaLocal || valores.length === 0)}
            key={clave}
            onSeleccionar={(valor) => onSeleccionar(clave, valor)}
            opciones={valores}
            titulo={titulo}
            valor={configuracion[clave]}
          />
        ))}
      </div>

      <div className="panel-configuracion__acciones">
        <Boton className="boton-pequeno" onClick={onVolver}>
          ⬅ VOLVER
        </Boton>
        <Boton
          className={`boton-pequeno${elementosFaltantes.length === 0 ? ' is-ready' : ''}`}
          disabled={elementosFaltantes.length > 0 || ocupado}
          onClick={onComenzar}
        >
          COMENZAR ▶
        </Boton>
      </div>

      <Texto aria-live="polite" className="panel-configuracion__aviso" as="p">
        {ocupado ? 'Creando la partida…' : errorNiveles
          || (elementosFaltantes.length > 0
            ? `Falta elegir: ${elementosFaltantes.join(', ')}`
            : '')}
      </Texto>
    </div>
  );
};

export default PanelConfiguracion;
