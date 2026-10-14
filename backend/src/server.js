import { config } from './config/env.js';
import { checkConnection, closePool, pool, withTransaction } from './repositories/db.js';
import { GameRepository } from './repositories/GameRepository.js';
import { MoveRepository } from './repositories/MoveRepository.js';
import { DifficultyProfileRepository } from './repositories/DifficultyProfileRepository.js';
import { StockfishAdapter } from './engines/StockfishAdapter.js';
import { AIServiceAdapter } from './engines/AIServiceAdapter.js';
import { SessionRegistry } from './services/SessionRegistry.js';
import { GameSessionFactory } from './services/GameSessionFactory.js';
import { GestorDePartida } from './services/GestorDePartida.js';
import { DifficultyService } from './services/DifficultyService.js';
import { ServicioHistorial } from './services/ServicioHistorial.js';
import { PgnService } from './services/PgnService.js';
import { createApp } from './app.js';

const newAiAdapter = () =>
  new AIServiceAdapter({ baseUrl: config.aiServiceUrl, timeoutMs: config.aiServiceTimeoutMs });
const aiHealth = newAiAdapter();
const registry = new SessionRegistry();
const difficultyRepo = new DifficultyProfileRepository(pool);
const gameRepo = new GameRepository(pool);
const moveRepo = new MoveRepository(pool);
const pgnService = new PgnService({ gameRepo, moveRepo, withTransaction });
const historial = new ServicioHistorial({ gameRepo, moveRepo, pgnService });
const gestor = new GestorDePartida({
  gameRepo,
  moveRepo,
  difficultyRepo,
  registry,
  factory: new GameSessionFactory({
    fallbackSkillLevel: config.stockfishFallbackSkillLevel,
    aiAdapterFactory: newAiAdapter,
    adapterFactory: ({ skillLevel }) =>
      new StockfishAdapter({
        command: config.stockfishPath,
        movetimeMs: config.stockfishMovetimeMs,
        timeoutMs: config.stockfishTimeoutMs,
        skillLevel,
      }),
  }),
  withTransaction,
});

const app = createApp({
  frontendUrl: config.frontendUrl,
  checkDb: checkConnection,
  checkAi: async () => (!aiHealth.configured ? 'not_configured' : (await aiHealth.health()) ? 'up' : 'down'),
  gestor,
  historial,
  pgnService,
  difficultyService: new DifficultyService({ difficultyRepo }),
});

// Sessions live in memory, so games left EN_PROGRESO by a previous process are orphaned.
try {
  const recovered = await gestor.recuperarPartidasHuerfanas();
  console.log(`Startup recovery: ${recovered} orphaned game(s) set to PENDIENTE`);
} catch (err) {
  console.error('Startup recovery failed:', err.message);
}

const server = app.listen(config.port, config.host, () => {
  console.log(`UNViMe backend listening on http://${config.host}:${config.port} (${config.nodeEnv})`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close(async () => {
    await registry.disposeAll();
    await closePool();
    process.exit(0);
  });
  server.closeAllConnections();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
