import { useEffect, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { piezasDesdeFen } from '../../../utils/traductores.js';

const POSICION_INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

const estiloSeleccion = { backgroundColor: 'var(--color-casilla-seleccionada)' };
const estiloDestino = {
  background: 'radial-gradient(circle, var(--color-destino-jugada) 22%, transparent 25%)',
};

const calcularAncho = () => Math.max(
  200,
  Math.min(
    540,
    window.innerWidth * 0.88,
    window.innerHeight * (window.innerWidth <= 900 ? 0.55 : 0.72),
  ),
);

const crearEstilosCasillas = (seleccionada, destinos) => {
  const estilos = Object.fromEntries(destinos.map((casilla) => [casilla, estiloDestino]));
  if (seleccionada) estilos[seleccionada] = estiloSeleccion;
  return estilos;
};

const Tablero = ({
  posicion = POSICION_INICIAL,
  color = 'w',
  clase = '',
  seleccionada = null,
  destinos = [],
  onCasilla,
}) => {
  const [ancho, setAncho] = useState(540);

  useEffect(() => {
    const actualizarAncho = () => setAncho(calcularAncho());
    actualizarAncho();
    window.addEventListener('resize', actualizarAncho);
    return () => window.removeEventListener('resize', actualizarAncho);
  }, []);

  return (
    <div
      className={`tablero ${clase}`.trim()}
      role="img"
      aria-label="Tablero de ajedrez"
    >
      <Chessboard
        options={{
          allowDragging: false,
          boardOrientation: color === 'b' ? 'black' : 'white',
          boardStyle: { width: ancho, height: ancho },
          darkSquareStyle: { backgroundColor: 'var(--color-casilla-oscura)' },
          lightSquareStyle: { backgroundColor: 'var(--color-casilla-clara)' },
          onSquareClick: onCasilla ? ({ square }) => onCasilla(square) : undefined,
          position: piezasDesdeFen(posicion),
          squareStyles: crearEstilosCasillas(seleccionada, destinos),
        }}
      />
    </div>
  );
};

export default Tablero;
