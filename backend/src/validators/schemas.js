import { z } from 'zod';

export const SQUARE_RE = /^[a-h][1-8]$/;

const square = z.string().regex(SQUARE_RE, 'must be a square like "e2"');

export const idParamSchema = z.object({ id: z.uuid() });

export const createGameSchema = z
  .object({
    mode: z.enum(['LOCAL', 'STOCKFISH', 'AI']),
    alias: z.string().trim().min(1).max(100),
    difficulty: z.enum(['FACIL', 'MEDIO', 'DIFICIL']).optional(),
    playerColor: z.enum(['WHITE', 'BLACK']).default('WHITE'),
  })
  .refine((v) => v.mode === 'LOCAL' || v.difficulty !== undefined, {
    path: ['difficulty'],
    message: 'difficulty is required when mode is not LOCAL',
  });

export const moveSchema = z.object({
  from: square,
  to: square,
  promotion: z.enum(['q', 'r', 'b', 'n']).optional(),
});

export const legalMovesQuerySchema = z.object({ square });

export const listGamesQuerySchema = z.object({
  mode: z.enum(['LOCAL', 'STOCKFISH', 'AI']).optional(),
  difficulty: z.enum(['FACIL', 'MEDIO', 'DIFICIL']).optional(),
  status: z.enum(['EN_PROGRESO', 'PENDIENTE', 'FINALIZADA']).optional(),
  result: z.enum(['1-0', '0-1', '1/2-1/2']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const MAX_PGN_CHARS = 200_000;
export const importPgnSchema = z.object({ pgn: z.string().min(1).max(MAX_PGN_CHARS) });

export const resignSchema = z.object({ color: z.enum(['WHITE', 'BLACK']).optional() });
