import { HttpStatus } from '@nestjs/common';

export interface FieldError {
  field: string;
  message: string;
}

/**
 * Domain/application error with a stable machine-readable code. Services throw these;
 * the ProblemDetailsFilter maps them to RFC 9457 responses. Messages must be safe for clients.
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status: HttpStatus,
    message: string,
    readonly meta?: Record<string, unknown>,
    readonly errors?: FieldError[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}
