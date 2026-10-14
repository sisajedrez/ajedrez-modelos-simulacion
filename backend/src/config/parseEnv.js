import { z } from 'zod';

// Empty strings (e.g. "STOCKFISH_PATH=") are treated as unset.
const optional = (schema) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const schema = z.object({
  HOST: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535),
  FRONTEND_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  STOCKFISH_PATH: optional(z.string()),
  STOCKFISH_MOVETIME_MS: z.coerce.number().int().positive().default(1000),
  STOCKFISH_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  STOCKFISH_FALLBACK_SKILL_LEVEL: z.coerce.number().int().min(0).max(20).default(0),
  AI_SERVICE_URL: optional(z.url()),
  AI_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
}).refine((v) => v.AI_SERVICE_TIMEOUT_MS > v.STOCKFISH_TIMEOUT_MS, {
  path: ['AI_SERVICE_TIMEOUT_MS'],
  message: 'must be greater than STOCKFISH_TIMEOUT_MS',
});

/** Validates a raw env source and returns a frozen config, or throws. */
export function parseEnv(source) {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  const d = result.data;
  return Object.freeze({
    host: d.HOST,
    port: d.PORT,
    frontendUrl: d.FRONTEND_URL,
    databaseUrl: d.DATABASE_URL,
    nodeEnv: d.NODE_ENV,
    stockfishPath: d.STOCKFISH_PATH,
    stockfishMovetimeMs: d.STOCKFISH_MOVETIME_MS,
    stockfishTimeoutMs: d.STOCKFISH_TIMEOUT_MS,
    stockfishFallbackSkillLevel: d.STOCKFISH_FALLBACK_SKILL_LEVEL,
    aiServiceUrl: d.AI_SERVICE_URL,
    aiServiceTimeoutMs: d.AI_SERVICE_TIMEOUT_MS,
  });
}
