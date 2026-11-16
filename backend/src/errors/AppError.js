export class AppError extends Error {
  constructor(code, message, status = 500, retryable = false) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}
