import { Router } from 'express';

export function createGamesRouter({ controller }) {
  const router = Router();
  router.post('/games', controller.create);
  router.get('/games', controller.list);
  router.post('/games/import', controller.importPgn);
  router.get('/games/:id', controller.detail);
  router.get('/games/:id/pgn', controller.pgn);
  router.post('/games/:id/pause', controller.pause);
  router.post('/games/:id/resume', controller.resume);
  router.get('/games/:id/legal-moves', controller.legalMoves);
  router.post('/games/:id/moves', controller.move);
  router.post('/games/:id/engine-move', controller.engineMove);
  router.post('/games/:id/resign', controller.resign);
  return router;
}
