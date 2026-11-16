import { AppError } from '../errors/AppError.js';
import { moveSchema } from './schemas.js';

// Parses data with a zod schema; throws VALIDATION_ERROR (400) with a readable message.
export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const message = result.error.issues
    .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ');
  throw new AppError('VALIDATION_ERROR', message, 400);
}

// Input-shape validation only; move legality is the Tablero's job.
export class ValidadorDeJugada {
  static validar(data) {
    return validate(moveSchema, data);
  }
}
