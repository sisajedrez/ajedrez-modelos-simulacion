import { AppError } from '../errors/AppError.js';
import { toGameDto } from './gameDto.js';

const notFound = () => new AppError('GAME_NOT_FOUND', 'Game not found', 404);

const FILTER_KEYS = ['mode', 'difficulty', 'status', 'result'];

export class ServicioHistorial {
  constructor({ gameRepo, moveRepo, pgnService }) {
    this.gameRepo = gameRepo;
    this.moveRepo = moveRepo;
    this.pgnService = pgnService;
  }

  // `filters` are already validated: { mode, difficulty, status, result, limit, offset }.
  async listarPartidas(filters = {}) {
    const { items, total } = await this.gameRepo.list(filters);
    const response = { items, total };
    if (items.length > 0 || total > 0) return response;

    const hasFilters = FILTER_KEYS.some((k) => filters[k] !== undefined);
    const anyGames = hasFilters ? (await this.gameRepo.list({ limit: 1, offset: 0 })).total > 0 : false;
    return anyGames
      ? {
          ...response,
          emptyReason: 'NO_MATCHES',
          message: 'No se encontraron partidas con los filtros seleccionados',
        }
      : { ...response, emptyReason: 'NO_GAMES', message: 'No hay partidas registradas' };
  }

  async obtenerPartida(gameId) {
    const game = await this.gameRepo.findById(gameId);
    if (!game) throw notFound();
    const moves = await this.moveRepo.findByGameId(gameId);
    return {
      ...toGameDto(game),
      source: game.source ?? 'USER',
      moves: moves.map((m) => ({
        moveNumber: m.moveNumber,
        color: m.color,
        san: m.san,
        fenBefore: m.fenBefore,
        fenAfter: m.fenAfter,
        timeSpentMs: m.timeSpentMs ?? null,
      })),
    };
  }

  async obtenerPGN(gameId) {
    const game = await this.gameRepo.findById(gameId);
    if (!game) throw notFound();
    const moves = await this.moveRepo.findByGameId(gameId);
    return { pgn: this.pgnService.exportar(game, moves), filename: `game-${gameId}.pgn` };
  }
}
