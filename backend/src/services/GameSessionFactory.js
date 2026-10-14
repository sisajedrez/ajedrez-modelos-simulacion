import { AppError } from '../errors/AppError.js';
import { Tablero } from '../domain/Tablero.js';
import { HumanOpponent } from '../engines/HumanOpponent.js';
import { StockfishOpponent } from '../engines/StockfishOpponent.js';
import { CustomAIOpponent } from '../engines/CustomAIOpponent.js';

export class GameSessionFactory {
  // adapterFactory({ skillLevel }) -> engine adapter; aiAdapterFactory() -> AIServiceAdapter.
  // Both are injected so tests can fake them.
  constructor({ adapterFactory, aiAdapterFactory, fallbackSkillLevel = 0, logger } = {}) {
    this.adapterFactory = adapterFactory;
    this.aiAdapterFactory = aiAdapterFactory;
    this.fallbackSkillLevel = fallbackSkillLevel;
    this.logger = logger;
  }

  // `tablero` lets callers supply a rebuilt board (e.g. from move history).
  // `skillLevel` comes from the game's difficulty profile; `difficulty` is its name (AI mode).
  create(mode, { tablero, skillLevel, difficulty } = {}) {
    if (mode === 'LOCAL') {
      return { tablero: tablero ?? new Tablero(), opponent: new HumanOpponent() };
    }
    if (mode === 'STOCKFISH' && this.adapterFactory) {
      const level = skillLevel ?? this.fallbackSkillLevel;
      const adapter = this.adapterFactory({ skillLevel: level });
      return {
        tablero: tablero ?? new Tablero(),
        opponent: new StockfishOpponent({ adapter, skillLevel: level }),
      };
    }
    if (mode === 'AI' && this.aiAdapterFactory && this.adapterFactory) {
      const level = this.fallbackSkillLevel;
      return {
        tablero: tablero ?? new Tablero(),
        opponent: new CustomAIOpponent({
          adapter: this.aiAdapterFactory(),
          difficulty,
          logger: this.logger,
          // The fallback engine is only spawned if the AI actually fails.
          fallbackFactory: () =>
            new StockfishOpponent({ adapter: this.adapterFactory({ skillLevel: level }), skillLevel: level }),
        }),
      };
    }
    throw new AppError('MODE_NOT_AVAILABLE', `Game mode ${mode} is not available yet`, 501);
  }
}
