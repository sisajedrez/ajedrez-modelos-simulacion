// Traduce entre los valores de la interfaz y los de la API.

const MODOS_A_API = { jugador: 'LOCAL', stockfish: 'STOCKFISH', unvime: 'AI' };

export const modoAApi = (modo) => MODOS_A_API[modo];

export const colorAApi = (color) => (color === 'b' ? 'BLACK' : 'WHITE');

export const colorDesdeApi = (color) => (
  String(color).toUpperCase().startsWith('B') ? 'b' : 'w'
);

export const colorOpuesto = (color) => (color === 'w' ? 'b' : 'w');

export const turnoDesdeFen = (fen) => (fen?.split(' ')[1] === 'b' ? 'b' : 'w');

// react-chessboard solo necesita la parte de las piezas del FEN.
export const piezasDesdeFen = (fen) => fen?.split(' ')[0];

const COLUMNAS = 'abcdefgh';

// Devuelve la pieza (letra FEN) que hay en una casilla, o null.
export const piezaEnCasilla = (fen, casilla) => {
  const filas = piezasDesdeFen(fen)?.split('/');
  if (!filas || filas.length !== 8) return null;
  const columna = COLUMNAS.indexOf(casilla[0]);
  const fila = filas[8 - Number(casilla[1])];
  if (columna < 0 || !fila) return null;

  let indice = 0;
  for (const caracter of fila) {
    if (/\d/.test(caracter)) {
      indice += Number(caracter);
    } else {
      if (indice === columna) return caracter;
      indice += 1;
    }
  }
  return null;
};

// ¿Mover de `desde` a `hasta` corona un peón? (hay que preguntar por la pieza).
export const esCoronacion = (fen, desde, hasta) => {
  const pieza = piezaEnCasilla(fen, desde);
  if (pieza !== 'P' && pieza !== 'p') return false;
  const filaFinal = pieza === 'P' ? '8' : '1';
  return hasta[1] === filaFinal;
};
