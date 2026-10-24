import { useState } from 'react';
import { mensajeDeError } from '../utils/mensajesError.js';
import { colorOpuesto, esCoronacion, piezaEnCasilla, turnoDesdeFen } from '../utils/traductores.js';

const POSICION_INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const estadoInicial = {
  id: null,
  modo: 'jugador',
  colorHumano: 'w',
  fen: POSICION_INICIAL,
  estado: null,
  jugadas: [],
  cierre: null,
};

const colorDePieza = (pieza) => (pieza === pieza.toUpperCase() ? 'w' : 'b');

export const usePartida = (api) => {
  const [partida, setPartida] = useState(estadoInicial);
  const [seleccionada, setSeleccionada] = useState(null);
  const [destinos, setDestinos] = useState([]);
  const [coronacion, setCoronacion] = useState(null);
  const [pensando, setPensando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const finalizada = partida.estado === 'FINALIZADA';
  const pausada = partida.estado === 'PENDIENTE';
  const turno = turnoDesdeFen(partida.fen);
  const esTurnoHumano = partida.modo === 'jugador' || turno === partida.colorHumano;
  const puedeJugar = Boolean(partida.id) && !finalizada && !pausada
    && !pensando && !cargando && !coronacion && esTurnoHumano;

  const limpiarSeleccion = () => {
    setSeleccionada(null);
    setDestinos([]);
  };

  const mostrarError = (fallo, tipo = 'general') => {
    setError({ tipo, mensaje: mensajeDeError(fallo) });
  };

  const aplicarJugada = (resultado) => {
    setPartida((actual) => ({
      ...actual,
      fen: resultado.fen ?? actual.fen,
      estado: resultado.estado ?? actual.estado,
      jugadas: resultado.san ? [...actual.jugadas, { san: resultado.san }] : actual.jugadas,
      cierre: resultado.estado === 'FINALIZADA'
        ? { resultado: resultado.resultado, motivo: resultado.motivo }
        : actual.cierre,
    }));
    return resultado.estado === 'FINALIZADA';
  };

  const pedirJugadaMaquina = async (id) => {
    setPensando(true);
    setError(null);
    try {
      aplicarJugada(await api.jugarMaquina(id));
    } catch (fallo) {
      mostrarError(fallo, 'motor');
    } finally {
      setPensando(false);
    }
  };

  const iniciar = async ({ modo, alias, dificultad, color }) => {
    setCargando(true);
    setError(null);
    limpiarSeleccion();
    try {
      const creada = await api.crearPartida({ modo, alias, dificultad, color });
      let fen = creada.fen ?? POSICION_INICIAL;
      let jugadas = [];
      if (modo !== 'jugador') {
        // Con el motor de blancas, el backend ya jugó al crear la partida.
        try {
          const detalle = await api.obtenerPartida(creada.id);
          fen = detalle.fen ?? fen;
          jugadas = detalle.jugadas;
        } catch {
          // La partida sigue; solo falta la lista inicial.
        }
      }
      setPartida({
        id: creada.id,
        modo,
        colorHumano: color,
        fen,
        estado: creada.estado ?? 'EN_PROGRESO',
        jugadas,
        cierre: null,
      });
      setCargando(false);
      if (modo !== 'jugador' && turnoDesdeFen(fen) !== color) {
        await pedirJugadaMaquina(creada.id);
      }
      return true;
    } catch (fallo) {
      mostrarError(fallo);
      setCargando(false);
      return false;
    }
  };

  const cargarOReanudar = async (id) => {
    setCargando(true);
    setError(null);
    limpiarSeleccion();
    try {
      const detalle = await api.obtenerPartida(id);
      let partidaActiva = detalle;

      if (detalle.estado === 'PENDIENTE') {
        const reanudada = await api.reanudar(id);
        partidaActiva = {
          ...detalle,
          ...reanudada,
          jugadas: detalle.jugadas || [],
        };
      }

      const modoFront = detalle.modo?.toLowerCase() === 'local' ? 'jugador' : detalle.modo?.toLowerCase();
      const colorHumano = (detalle.tipoNegras === 'HUMAN' && detalle.tipoBlancas !== 'HUMAN') ? 'b' : 'w';
      const fen = partidaActiva.fen || POSICION_INICIAL;
      const jugadas = partidaActiva.jugadas || [];

      setPartida({
        id: partidaActiva.id,
        modo: modoFront || 'jugador',
        colorHumano,
        fen,
        estado: partidaActiva.estado || 'EN_PROGRESO',
        jugadas,
        cierre: partidaActiva.estado === 'FINALIZADA'
          ? { resultado: partidaActiva.resultado, motivo: null }
          : null,
      });

      setCargando(false);

      if (
        partidaActiva.estado === 'EN_PROGRESO' &&
        modoFront !== 'jugador' &&
        turnoDesdeFen(fen) !== colorHumano
      ) {
        await pedirJugadaMaquina(partidaActiva.id);
      }

      return partidaActiva;
    } catch (fallo) {
      mostrarError(fallo);
      setCargando(false);
      throw fallo;
    }
  };

  const enviarJugada = async (desde, hasta, promocion) => {
    setCargando(true);
    setError(null);
    limpiarSeleccion();
    setCoronacion(null);
    let terminada;
    try {
      const resultado = await api.enviarJugada(partida.id, { desde, hasta, coronacion: promocion });
      if (!resultado.valida) {
        mostrarError(new Error('Esa jugada no es válida.'));
        return;
      }
      terminada = aplicarJugada(resultado);
    } catch (fallo) {
      mostrarError(fallo);
      return;
    } finally {
      setCargando(false);
    }
    if (!terminada && partida.modo !== 'jugador') await pedirJugadaMaquina(partida.id);
  };

  const alTocarCasilla = async (casilla) => {
    if (!puedeJugar) return;

    if (seleccionada && destinos.includes(casilla)) {
      if (esCoronacion(partida.fen, seleccionada, casilla)) {
        setCoronacion({ desde: seleccionada, hasta: casilla });
        return;
      }
      await enviarJugada(seleccionada, casilla);
      return;
    }

    const pieza = piezaEnCasilla(partida.fen, casilla);
    if (!pieza || colorDePieza(pieza) !== turno || casilla === seleccionada) {
      limpiarSeleccion();
      return;
    }

    setSeleccionada(casilla);
    setDestinos([]);
    try {
      setDestinos(await api.obtenerDestinos(partida.id, casilla));
    } catch (fallo) {
      limpiarSeleccion();
      mostrarError(fallo);
    }
  };

  const elegirCoronacion = (pieza) => {
    if (coronacion) enviarJugada(coronacion.desde, coronacion.hasta, pieza);
  };

  const cancelarCoronacion = () => {
    setCoronacion(null);
    limpiarSeleccion();
  };

  const reintentarMaquina = () => pedirJugadaMaquina(partida.id);

  const rendirse = async (color) => {
    setCargando(true);
    setError(null);
    limpiarSeleccion();
    try {
      const final = await api.rendirse(partida.id, color);
      setPartida((actual) => ({
        ...actual,
        estado: 'FINALIZADA',
        cierre: { resultado: final.resultado, motivo: final.motivo },
      }));
      return true;
    } catch (fallo) {
      mostrarError(fallo);
      return false;
    } finally {
      setCargando(false);
    }
  };

  const terminarPorTiempo = (colorGanador) => {
    setPartida((actual) => ({
      ...actual,
      estado: 'FINALIZADA',
      cierre: {
        resultado: colorGanador === 'w' ? '1-0' : '0-1',
        motivo: 'TIMEOUT',
      },
    }));
  };

  const guardarYSalir = async () => {
    setCargando(true);
    setError(null);
    try {
      await api.pausar(partida.id);
      return partida.id;
    } catch (fallo) {
      mostrarError(fallo);
      return null;
    } finally {
      setCargando(false);
    }
  };

  const descartar = () => {
    setPartida(estadoInicial);
    limpiarSeleccion();
    setCoronacion(null);
    setError(null);
  };

  return {
    partida,
    seleccionada,
    destinos,
    coronacion,
    pensando,
    cargando,
    error,
    puedeJugar,
    finalizada,
    pausada,
    colorRival: colorOpuesto(partida.colorHumano),
    iniciar,
    cargarOReanudar,
    alTocarCasilla,
    elegirCoronacion,
    cancelarCoronacion,
    reintentarMaquina,
    rendirse,
    terminarPorTiempo,
    guardarYSalir,
    descartar,
    limpiarError: () => setError(null),
  };
};
