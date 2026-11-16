// Repite cada secuencia con chess.js (la misma libreria que usa el backend)
// y comprueba que el resultado coincida con indice.json.
// Uso: copiar esta carpeta dentro de tests-integracion/, ejecutar "npm install chess.js" ahi y luego:
//   node secuencias-QA/verificar.mjs
import { Chess } from 'chess.js';
import { readFileSync } from 'node:fs';

const dir = new URL('./', import.meta.url);
const indice = JSON.parse(readFileSync(new URL('indice.json', dir), 'utf8'));
let fallas = 0;

for (const c of indice) {
  const chess = new Chess();
  let ok = true;
  let nota = '';

  if (c.archivo_preparacion) {
    const jugadas = JSON.parse(readFileSync(new URL(c.archivo_preparacion, dir), 'utf8'));
    for (const j of jugadas) {
      try {
        chess.move({ from: j.from, to: j.to, promotion: j.promotion || undefined });
      } catch {
        ok = false;
        nota = `jugada ilegal en el ply ${j.ply}`;
        break;
      }
    }
  }

  if (ok && c.jugada_a_probar) {
    const esLegal = chess.moves({ verbose: true }).some(
      (m) => m.from === c.jugada_a_probar.from && m.to === c.jugada_a_probar.to
    );
    if (esLegal !== c.debe_ser_legal) {
      ok = false;
      nota = `legalidad distinta a la esperada (es legal: ${esLegal})`;
    }
  }

  if (ok && c.resultado_final_esperado) {
    const final = c.resultado_final_esperado;
    const real = {
      mate: chess.isCheckmate(),
      ahogado: chess.isStalemate(),
      triple: chess.isThreefoldRepetition(),
      material: chess.isInsufficientMaterial(),
    }[final];
    if (!real) {
      ok = false;
      nota = `la partida no termina por ${final}`;
    }
  }

  console.log(`${ok ? 'OK   ' : 'FALLA'} ${c.id} ${nota}`);
  if (!ok) fallas++;
}
process.exit(fallas ? 1 : 0);
