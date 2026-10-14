import express from 'express';
import cors from 'cors';
import { createHealthRouter } from './routes/health.routes.js';
import { createGamesRouter } from './routes/games.routes.js';
import { createDifficultyRouter } from './routes/difficulty.routes.js';
import { createGamesController } from './controllers/games.controller.js';
import { createDifficultyController } from './controllers/difficulty.controller.js';
import { errorHandler, notFoundHandler } from './errors/errorHandler.js';

export function createApp({ frontendUrl, checkDb, checkAi, gestor, historial, pgnService, difficultyService }) {
  const app = express();
  app.use(cors({ origin: (origin, cb) => cb(null, origin === frontendUrl) }));
  // PGN import accepts up to ~200KB of text; the zod schema enforces the exact limit.
  app.use(express.json({ limit: '300kb' }));
  app.use(createHealthRouter({ checkDb, checkAi }));
  if (gestor) {
    app.use(createGamesRouter({ controller: createGamesController({ gestor, historial, pgnService }) }));
  }
  if (difficultyService) {
    app.use(createDifficultyRouter({ controller: createDifficultyController({ difficultyService }) }));
  }
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
