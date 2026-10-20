// Convierte las respuestas de la API al formato interno del front.

const lista = (datos, ...claves) => {
  if (Array.isArray(datos)) return datos;
  for (const clave of claves) {
    if (Array.isArray(datos?.[clave])) return datos[clave];
  }
  return [];
};

const normalizarJugadaDeLista = (jugada) => (
  typeof jugada === 'string'
    ? { san: jugada }
    : { san: jugada.san, color: jugada.color, fen: jugada.fenAfter ?? jugada.fen }
);

// POST /games, GET /games/:id, /pause y /resume. El detalle trae `moves`.
export const normalizarPartida = (datos) => {
  const partida = datos ?? {};
  return {
    id: partida.id,
    fen: partida.fen,
    turno: partida.turn === 'BLACK' ? 'b' : 'w',
    estado: partida.status,
    resultado: partida.result ?? null,
    modo: partida.mode,
    nombreBlancas: partida.whitePlayerName,
    nombreNegras: partida.blackPlayerName,
    jugadas: lista(partida.moves).map(normalizarJugadaDeLista),
    errorMotor: partida.engineError
      ? { codigo: partida.engineError.code, reintentable: partida.engineError.retryable !== false }
      : null,
  };
};

// POST /games/:id/moves, /engine-move y /resign (este último no trae san ni fen).
export const normalizarResultadoJugada = (datos) => {
  const jugada = datos ?? {};
  return {
    valida: jugada.valid !== false,
    san: jugada.san,
    fen: jugada.fen,
    estado: jugada.status,
    resultado: jugada.result ?? null,
    motivo: jugada.endReason ?? null,
  };
};

// Una coronación llega una vez por pieza con el mismo `to`: se deja una sola casilla.
export const normalizarDestinos = (datos) => [
  ...new Set(lista(datos, 'moves').map((jugada) => jugada.to).filter(Boolean)),
];

// `POST /games` recibe el `name` del perfil (FACIL | MEDIO | DIFICIL) en `difficulty`.
export const normalizarPerfiles = (datos) => (
  lista(datos).map((perfil) => ({
    valor: perfil.name,
    nombre: perfil.name,
    nivelMotor: perfil.skillLevel ?? null,
  }))
);
