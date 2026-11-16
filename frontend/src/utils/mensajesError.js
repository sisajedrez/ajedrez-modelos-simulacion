const MENSAJES = {
  ILLEGAL_MOVE: 'Esa jugada no es legal.',
  NOT_YOUR_TURN: 'Todavía es el turno del motor.',
  NOT_ENGINE_TURN: 'Todavía no es el turno del motor.',
  GAME_NOT_ACTIVE: 'La partida ya no está en curso.',
  GAME_NOT_PENDING: 'La partida no está guardada.',
  GAME_NOT_FOUND: 'No se encontró la partida.',
  MODE_NOT_AVAILABLE: 'Ese modo de juego todavía no está disponible.',
  ENGINE_TIMEOUT: 'Stockfish no respondió a tiempo.',
  ENGINE_UNAVAILABLE: 'Stockfish no está disponible en este momento.',
  ENGINE_NO_MOVE: 'El motor no devolvió ninguna jugada.',
  ENGINE_PROTOCOL_ERROR: 'El motor devolvió una respuesta que no se entiende.',
  ENGINE_ILLEGAL_MOVE: 'El motor propuso una jugada ilegal.',
  SESSION_INCONSISTENT: 'La partida guardada está dañada.',
  PAYLOAD_TOO_LARGE: 'El archivo es demasiado grande.',
  INVALID_PGN: 'El PGN no es válido.',
  SIN_CONEXION: 'No se pudo conectar con el servidor. Revisá que el backend esté encendido.',
};

export const mensajeDeError = (error) => (
  MENSAJES[error?.codigo] ?? error?.message ?? 'Ocurrió un error inesperado.'
);
