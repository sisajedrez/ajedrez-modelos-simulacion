import { Router } from 'express';

export function createHealthRouter({ checkDb, checkAi = async () => 'not_configured' }) {
  const router = Router();

  router.get('/health', async (req, res) => {
    const dbUp = await checkDb().catch(() => false);
    const ai = await checkAi().catch(() => 'down');
    res.status(200).json({
      status: 'ok',
      db: dbUp ? 'up' : 'down',
      ai,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
