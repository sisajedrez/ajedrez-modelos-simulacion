import { Router } from 'express';

export function createDifficultyRouter({ controller }) {
  const router = Router();
  router.get('/difficulty-profiles', controller.list);
  return router;
}
