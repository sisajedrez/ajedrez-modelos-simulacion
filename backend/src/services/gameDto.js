import { turnoDesdeFEN } from '../domain/fen.js';

export function toGameDto(game) {
  return {
    id: game.id,
    mode: game.mode,
    status: game.status,
    result: game.result ?? null,
    fen: game.currentFen,
    turn: turnoDesdeFEN(game.currentFen),
    whitePlayerName: game.whitePlayerName,
    blackPlayerName: game.blackPlayerName,
    whiteType: game.whiteType,
    blackType: game.blackType,
    difficultyProfileId: game.difficultyProfileId ?? null,
    startedAt: game.startedAt,
    endedAt: game.endedAt ?? null,
  };
}
