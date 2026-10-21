'use strict';
const { Chess } = require('chess.js');
const RESULTADOS = Object.freeze({
  '1-0': 'WHITE_WINS',
  '0-1': 'BLACK_WINS',
  '1/2-1/2': 'DRAW',
  '*': null,
});

class ImportadorPGN {
  constructor({ maxBytes = 1_048_576 } = {}) {
    if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
      throw new TypeError('maxBytes debe ser un entero positivo');
    }
    this.maxBytes = maxBytes;
  }

  importar(pgn) {
    if (typeof pgn !== 'string' || pgn.trim() === '') {
      throw new TypeError('El contenido PGN es obligatorio');
    }
    if (Buffer.byteLength(pgn, 'utf8') > this.maxBytes) {
      throw new RangeError(`El PGN supera el maximo permitido de ${this.maxBytes} bytes`);
    }

    const chess = new Chess();
    try {
      chess.loadPgn(pgn);
    } catch (error) {
      throw new Error(`PGN invalido: ${error.message}`, { cause: error });
    }

    const headers = chess.header();
    const resultadoPgn = headers.Result || '*';
    if (!Object.hasOwn(RESULTADOS, resultadoPgn)) {
      throw new Error(`Resultado PGN no reconocido: ${resultadoPgn}`);
    }

    const moves = chess.history({ verbose: true }).map((move, index) => ({
      moveNumber: index + 1,
      color: move.color === 'w' ? 'WHITE' : 'BLACK',
      san: move.san,
      uci: move.lan,
      fenBefore: move.before,
      fenAfter: move.after,
    }));

    return {
      headers: { ...headers },
      whiteAlias: headers.White || 'Blancas',
      blackAlias: headers.Black || 'Negras',
      initialFen: headers.FEN || new Chess().fen(),
      currentFen: chess.fen(),
      moves,
      pgnResult: resultadoPgn,
      result: RESULTADOS[resultadoPgn],
      finished: resultadoPgn !== '*',
    };
  }
}
module.exports = ImportadorPGN;


/**
 * Valida y convierte un PGN individual a datos que el backend puede persistir.
 *
 * Esta clase solo parsea; no depende del frontend ni escribe en la base de datos.
 * Para ofrecer POST /games/import-pgn, un controller debe validar el cuerpo/archivo
 * y llamar importar(). Luego, dentro de una transaccion, el servicio de partidas debe
 * crear la partida y guardar cada elemento de `moves` en el store. Finalmente, la ruta
 * se registra en routes/index.js. Esos cambios externos son necesarios para exponer
 * la importacion por HTTP y conservar la partida, pero no se hacen desde esta clase.
 */