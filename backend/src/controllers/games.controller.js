import { validate } from '../validators/ValidadorDeJugada.js';
import {
  createGameSchema,
  idParamSchema,
  importPgnSchema,
  listGamesQuerySchema,
  legalMovesQuerySchema,
  moveSchema,
  resignSchema,
} from '../validators/schemas.js';

export function createGamesController({ gestor, historial, pgnService }) {
  return {
    async list(req, res) {
      // Blank query values (e.g. "?mode=") mean "no filter".
      const query = Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== ''));
      res.json(await historial.listarPartidas(validate(listGamesQuerySchema, query)));
    },

    async detail(req, res) {
      const { id } = validate(idParamSchema, req.params);
      res.json(await historial.obtenerPartida(id));
    },

    async pgn(req, res) {
      const { id } = validate(idParamSchema, req.params);
      const { pgn, filename } = await historial.obtenerPGN(id);
      res
        .set('Content-Type', 'application/x-chess-pgn; charset=utf-8')
        .set('Content-Disposition', `attachment; filename=${filename}`)
        .send(pgn);
    },

    async pause(req, res) {
      const { id } = validate(idParamSchema, req.params);
      res.json(await gestor.pausarPartida(id));
    },

    async resume(req, res) {
      const { id } = validate(idParamSchema, req.params);
      res.json(await gestor.reanudarPartida(id));
    },

    async importPgn(req, res) {
      const { pgn } = validate(importPgnSchema, req.body);
      res.status(201).json(await pgnService.importar(pgn));
    },

    async create(req, res) {
      const input = validate(createGameSchema, req.body);
      res.status(201).json(await gestor.crearPartida(input));
    },

    async legalMoves(req, res) {
      const { id } = validate(idParamSchema, req.params);
      const { square } = validate(legalMovesQuerySchema, req.query);
      res.json({ square, moves: await gestor.obtenerMovimientosLegales(id, square) });
    },

    async move(req, res) {
      const { id } = validate(idParamSchema, req.params);
      const move = validate(moveSchema, req.body);
      res.json(await gestor.realizarJugada(id, move));
    },

    async engineMove(req, res) {
      const { id } = validate(idParamSchema, req.params);
      res.json(await gestor.jugarTurnoMaquina(id));
    },

    async resign(req, res) {
      const { id } = validate(idParamSchema, req.params);
      const input = validate(resignSchema, req.body ?? {});
      res.json(await gestor.rendirse(id, input));
    },
  };
}
