import { colorAApi, modoAApi } from '../utils/traductores.js';
import {
  normalizarDestinos,
  normalizarPartida,
  normalizarPerfiles,
  normalizarResultadoJugada,
} from './normalizar.js';

export const crearPartidasApi = (cliente) => ({
  obtenerPerfiles: async () => normalizarPerfiles(await cliente.get('/difficulty-profiles')),

  listarPartidas: async (params = {}) => cliente.get('/games', params),

  crearPartida: async ({ modo, alias, dificultad, color }) => normalizarPartida(
    await cliente.post('/games', {
      mode: modoAApi(modo),
      alias,
      difficulty: dificultad || undefined,
      playerColor: colorAApi(color),
    }),
  ),

  obtenerPartida: async (id) => normalizarPartida(await cliente.get(`/games/${id}`)),

  obtenerDestinos: async (id, casilla) => normalizarDestinos(
    await cliente.get(`/games/${id}/legal-moves`, { square: casilla }),
  ),

  enviarJugada: async (id, { desde, hasta, coronacion }) => normalizarResultadoJugada(
    await cliente.post(`/games/${id}/moves`, {
      from: desde,
      to: hasta,
      ...(coronacion ? { promotion: coronacion } : {}),
    }),
  ),

  jugarMaquina: async (id) => normalizarResultadoJugada(
    await cliente.post(`/games/${id}/engine-move`),
  ),

  rendirse: async (id, color) => normalizarResultadoJugada(
    await cliente.post(`/games/${id}/resign`, { color: colorAApi(color) }),
  ),

  pausar: async (id) => cliente.post(`/games/${id}/pause`),

  reanudar: async (id) => normalizarPartida(await cliente.post(`/games/${id}/resume`)),
});
