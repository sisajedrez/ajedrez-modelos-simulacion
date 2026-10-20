export const ganadorDesdeResultado = (resultado) => {
  const valor = String(resultado ?? '').toUpperCase();
  if (valor === '1-0' || valor.startsWith('WHITE')) return 'w';
  if (valor === '0-1' || valor.startsWith('BLACK')) return 'b';
  if (valor === '1/2-1/2' || valor.startsWith('DRAW') || valor.startsWith('TABLAS')) return 'tablas';
  return null;
};

const MOTIVOS = [
  [/STALEMATE|AHOGADO/, 'rey ahogado'],
  [/CHECKMATE|JAQUE|^MATE/, 'jaque mate'],
  [/RESIGN|ABANDON|ABAND/, 'abandono'],
  [/REPETITION|REPETICI/, 'triple repetición'],
  [/FIFTY|50/, 'regla de los 50 movimientos'],
  [/INSUFFICIENT|MATERIAL/, 'material insuficiente'],
];

export const describirMotivo = (motivo) => {
  const valor = String(motivo ?? '').toUpperCase();
  const coincidencia = MOTIVOS.find(([patron]) => patron.test(valor));
  return coincidencia ? coincidencia[1] : null;
};

export const construirResultado = ({ resultado, motivo, nombres, idPartida }) => {
  const ganador = ganadorDesdeResultado(resultado);
  const razon = describirMotivo(motivo);

  if (ganador === 'tablas') {
    return {
      tipo: 'tablas',
      titulo: '¡Tablas!',
      mensaje: razon ? `por ${razon}` : 'la partida terminó en empate',
      idPartida,
    };
  }

  if (ganador === 'w' || ganador === 'b') {
    const nombreColor = ganador === 'w' ? 'Blancas' : 'Negras';
    const perdedor = nombres[ganador === 'w' ? 'b' : 'w'];
    return {
      tipo: 'victoria',
      titulo: `¡${nombres[ganador]} (${nombreColor}) gana!`,
      mensaje: razon === 'abandono' ? `por abandono de ${perdedor}` : `por ${razon ?? 'resultado final'}`,
      idPartida,
    };
  }

  return { tipo: 'tablas', titulo: 'Partida finalizada', mensaje: razon ? `por ${razon}` : '', idPartida };
};
