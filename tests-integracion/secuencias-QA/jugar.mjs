// Reproduce una secuencia de jugadas contra el backend (sin Postman).
// No modifica el proyecto: solo manda pedidos HTTP a 127.0.0.1:3001 y muestra las respuestas.
//
// Uso (desde la carpeta que contiene secuencias-QA):
//   node secuencias-QA/jugar.mjs RN-02B-1a
//   node secuencias-QA/jugar.mjs RN-03-B
//   node secuencias-QA/jugar.mjs --archivo EST-01-datos/EST-01-parte1.json --pausar
//   node secuencias-QA/jugar.mjs --archivo EST-01-datos/EST-01-parte2.json --partida <ID> --reanudar
//
// Opciones:
//   --partida <ID>   seguir en una partida existente (en vez de crear una nueva)
//   --pausar         al terminar las jugadas, hace POST /games/:id/pause
//   --reanudar       antes de las jugadas, hace POST /games/:id/resume
//   --base <URL>     por defecto http://127.0.0.1:3001
import { readFileSync } from 'node:fs';

// ====== AJUSTAR SI HACE FALTA (formato real del backend) ======
const crearBody = () => ({ mode: 'LOCAL', alias: 'Jugador 1', playerColor: 'WHITE' });
const moveBody = (j) => ({ from: j.from, to: j.to, ...(j.promotion ? { promotion: j.promotion } : {}) });
const getGameId = (data) => data?.id ?? data?.gameId ?? data?.game?.id;
// ==============================================================

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const BASE = opt('--base') ?? 'http://127.0.0.1:3001';
const dir = new URL('./', import.meta.url);
const leer = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'));

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
    return { ok: r.ok, status: r.status, ms, data };
  } catch (e) {
    console.error('No se pudo conectar con el backend (esta corriendo?):', e.message);
    process.exit(2);
  }
}

const prom = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);

async function jugarSecuencia(jugadas, gameId) {
  const tiempos = [];
  for (const j of jugadas) {
    const r = await pedir('POST', `/games/${gameId}/moves`, moveBody(j));
    tiempos.push(r.ms);
    if (!r.ok) {
      console.log(`  FALLA en el ply ${j.ply} (${j.from}->${j.to}${j.promotion ? '=' + j.promotion : ''}): HTTP ${r.status}`);
      console.log('  respuesta:', JSON.stringify(r.data).slice(0, 300));
      return false;
    }
  }
  const resumen = tiempos.length >= 40
    ? `primeras 20: ${prom(tiempos.slice(0, 20))} ms | ultimas 20: ${prom(tiempos.slice(-20))} ms | maximo: ${Math.max(...tiempos)} ms`
    : `promedio: ${prom(tiempos)} ms | maximo: ${Math.max(...tiempos)} ms`;
  console.log(`  ${jugadas.length} jugadas aceptadas (${resumen})`);
  return true;
}

async function mostrarEstado(gameId) {
  const r = await pedir('GET', `/games/${gameId}`);
  console.log(`  estado de la partida (HTTP ${r.status}):`, JSON.stringify(r.data).slice(0, 400));
}

async function crearPartida() {
  const r = await pedir('POST', '/games', crearBody());
  const id = getGameId(r.data);
  if (!r.ok || !id) {
    console.log('  No se pudo crear la partida: HTTP', r.status, JSON.stringify(r.data).slice(0, 300));
    process.exit(1);
  }
  return id;
}

const archivo = opt('--archivo');
let casos;
if (archivo) {
  casos = [{ id: archivo, jugadas: leer(archivo), probar: null }];
} else {
  const id = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
  if (!id) { console.error('Indica un ID de caso (ej: RN-02B-1a) o --archivo <ruta.json>'); process.exit(1); }
  const entrada = leer(new URL('indice.json', dir)).find((c) => c.id === id);
  if (!entrada) { console.error('No existe el caso', id); process.exit(1); }
  casos = [{
    id,
    jugadas: entrada.archivo_preparacion ? leer(new URL(entrada.archivo_preparacion, dir)) : [],
    probar: entrada.jugada_a_probar,
    promociones: entrada.promociones_a_probar,
    esperado: entrada.esperado,
    legal: entrada.debe_ser_legal,
  }];
}

for (const c of casos) {
  const variantes = c.promociones ?? [undefined];
  for (const promo of variantes) {
    console.log(`\n== ${c.id}${promo ? ' (promocion a ' + promo + ')' : ''}`);
    const gameId = opt('--partida') ?? (await crearPartida());
    console.log('  partida:', gameId);
    if (args.includes('--reanudar')) {
      const r = await pedir('POST', `/games/${gameId}/resume`);
      console.log('  reanudar: HTTP', r.status);
    }
    const bien = await jugarSecuencia(c.jugadas, gameId);
    if (bien && c.probar) {
      const intento = { ply: 0, from: c.probar.from, to: c.probar.to, promotion: promo };
      const r = await pedir('POST', `/games/${gameId}/moves`, moveBody(intento));
      console.log(`  JUGADA A PROBAR ${c.probar.from}->${c.probar.to}${promo ? '=' + promo : ''}: HTTP ${r.status} en ${r.ms} ms (${r.ok ? 'aceptada' : 'rechazada'})`);
      console.log('  respuesta:', JSON.stringify(r.data).slice(0, 300));
      console.log(`  esperado: ${c.legal ? 'ACEPTADA' : 'RECHAZADA'} -> ${r.ok === c.legal ? 'COINCIDE' : 'NO COINCIDE, revisar'}`);
    }
    if (bien && args.includes('--pausar')) {
      const r = await pedir('POST', `/games/${gameId}/pause`);
      console.log('  pausar: HTTP', r.status);
    }
    await mostrarEstado(gameId);
    if (c.esperado) console.log('  esperado segun el plan:', c.esperado);
  }
}
