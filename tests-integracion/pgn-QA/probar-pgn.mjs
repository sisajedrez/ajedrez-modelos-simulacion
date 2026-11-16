// Prueba la importacion y exportacion de PGN contra el backend (sin Postman ni Bruno).
// No modifica el proyecto: solo manda pedidos HTTP. Cada importacion aceptada crea una partida en tu base local.
//
// Uso (desde la carpeta tests-integracion):
//   node pgn-QA/probar-pgn.mjs               -> corre todos los casos de indice-pgn.json
//   node pgn-QA/probar-pgn.mjs PF-IMP-01     -> corre un solo caso
//   node pgn-QA/probar-pgn.mjs --exportar <ID-de-partida>   -> exporta una partida existente a pgn-QA/exportados/
//   --base <URL>  por defecto http://127.0.0.1:3001
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const BASE = opt('--base') ?? 'http://127.0.0.1:3001';
const dir = new URL('./', import.meta.url);
const salida = new URL('exportados/', dir);
mkdirSync(salida, { recursive: true });

async function pedir(metodo, ruta, cuerpo) {
  const t0 = performance.now();
  try {
    const r = await fetch(BASE + ruta, {
      method: metodo,
      headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const ms = Math.round(performance.now() - t0);
    const texto = await r.text();
    let data; try { data = JSON.parse(texto); } catch { data = texto; }
    return { ok: r.ok, status: r.status, ms, data, texto, tipo: r.headers.get('content-type') ?? '' };
  } catch (e) {
    console.error('No se pudo conectar con el backend (esta corriendo?):', e.message);
    process.exit(2);
  }
}

const corto = (x, n = 400) => (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, n);
const idDe = (d) => d?.id ?? d?.gameId ?? d?.game?.id;
const lista = (d) => (Array.isArray(d) ? d : d?.items ?? d?.games ?? d?.data);

async function cantidadPartidas() {
  const r = await pedir('GET', '/games?limit=200');
  const l = lista(r.data);
  return Array.isArray(l) ? l.length : null;
}

async function exportar(id, etiqueta) {
  const r = await pedir('GET', `/games/${id}/pgn`);
  const pgn = r.tipo.includes('json') ? (r.data?.pgn ?? JSON.stringify(r.data)) : r.texto;
  console.log(`  exportar GET /games/${id}/pgn: HTTP ${r.status} en ${r.ms} ms`);
  if (!r.ok) { console.log('  respuesta:', corto(r.data)); return; }
  const archivo = new URL(`${etiqueta}_${id.slice(0, 8)}.pgn`, salida);
  writeFileSync(archivo, pgn);
  console.log('  guardado en:', archivo.pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  console.log('  ---- PGN exportado ----');
  console.log(pgn.split('\n').map((l) => '  ' + l).join('\n'));
  console.log('  -----------------------');
}

const idExportar = opt('--exportar');
if (idExportar) {
  console.log(`\n== Exportar ${idExportar}`);
  const g = await pedir('GET', `/games/${idExportar}`);
  console.log(`  estado de la partida: HTTP ${g.status}`, g.ok ? `status=${g.data.status} result=${g.data.result} jugadas=${g.data.moves?.length}` : corto(g.data));
  await exportar(idExportar, 'exportacion');
  process.exit(0);
}

const indice = JSON.parse(readFileSync(new URL('indice-pgn.json', dir), 'utf8'));
const filtro = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--base');
const casos = filtro ? indice.filter((c) => c.id === filtro) : indice;
if (!casos.length) { console.error('No existe el caso', filtro); process.exit(1); }

for (const c of casos) {
  console.log(`\n== ${c.id}: ${c.descripcion}`);
  const pgn = readFileSync(new URL(c.archivo, dir), 'utf8');
  const antes = await cantidadPartidas();
  const r = await pedir('POST', '/games/import', { pgn });
  const despues = await cantidadPartidas();
  console.log(`  importar POST /games/import: HTTP ${r.status} en ${r.ms} ms (${r.ok ? 'aceptado' : 'rechazado'})`);
  console.log('  respuesta:', corto(r.data));
  if (r.status === 404 && /not found|cannot post/i.test(corto(r.data))) {
    console.log('  AVISO: la ruta POST /games/import parece no estar montada en este backend. Los casos de importacion quedarian BLOQUEADOS.');
  }
  if (antes !== null && despues !== null) {
    console.log(`  partidas en la base antes/despues (maximo 200 visibles): ${antes} -> ${despues}`);
  } else {
    console.log('  (no se pudo contar partidas por la API: verificar con psql: SELECT count(*) FROM games;)');
  }
  const aceptado = r.ok;
  console.log(`  esperado: ${c.esperado.toUpperCase()} -> ${aceptado === (c.esperado === 'aceptar') ? 'COINCIDE' : 'NO COINCIDE, revisar'}`);
  console.log('  verificar:', c.verificar);
  if (r.status >= 500) console.log('  ATENCION: error 500 del servidor. Es un defecto para reportar.');
  const id = idDe(r.data);
  if (aceptado && id) {
    console.log('  partida creada:', id);
    const g = await pedir('GET', `/games/${id}`);
    if (g.ok) console.log(`  estado: status=${g.data.status} result=${g.data.result} jugadores=${g.data.whitePlayerName} vs ${g.data.blackPlayerName} jugadas=${g.data.moves?.length}`);
    await exportar(id, c.id);
  } else if (aceptado) {
    console.log('  (no se encontro el ID en la respuesta; buscalo con: SELECT id, status FROM games ORDER BY started_at DESC LIMIT 1;)');
  }
}
