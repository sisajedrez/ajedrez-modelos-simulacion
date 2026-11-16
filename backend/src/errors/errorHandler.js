import { AppError } from './AppError.js';

const body = (code, message, retryable = false) => ({ error: { code, message, retryable } });

export function notFoundHandler(req, res) {
  res.status(404).json(body('NOT_FOUND', `Route ${req.method} ${req.path} not found`));
}

// Express recognizes error middleware by its 4-argument signature.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json(body(err.code, err.message, err.retryable));
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json(body('VALIDATION_ERROR', 'Malformed JSON body'));
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json(body('PAYLOAD_TOO_LARGE', 'Request body is too large'));
  }
  console.error(err);
  return res.status(500).json(body('INTERNAL_ERROR', 'Internal server error'));
}
