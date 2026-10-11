import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError, type FieldError } from '../errors/app-error';
import { CORRELATION_HEADER } from '../http/correlation-id.middleware';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  traceId: string;
  errors?: FieldError[];
  meta?: Record<string, unknown>;
}

const TYPE_BASE = 'https://flygo.dev/errors/';

const toKebab = (code: string) => code.toLowerCase().replace(/_/g, '-');

const defaultCodeFor = (status: number): string =>
  ({
    400: 'BAD_REQUEST',
    401: 'UNAUTHENTICATED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    405: 'METHOD_NOT_ALLOWED',
    409: 'CONFLICT',
    413: 'PAYLOAD_TOO_LARGE',
    415: 'UNSUPPORTED_MEDIA_TYPE',
    422: 'UNPROCESSABLE_ENTITY',
    429: 'TOO_MANY_REQUESTS',
  })[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR');

/**
 * Converts every error into application/problem+json. Internal details (stack traces,
 * SQL, driver messages) are logged server-side and never returned to clients.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const traceId = (req.headers[CORRELATION_HEADER] as string | undefined) ?? 'unknown';

    const problem = this.toProblem(exception, traceId);
    if (problem.status >= 500) {
      this.logger.error({ err: exception, traceId, path: req.path }, 'Unhandled error');
    }

    res.status(problem.status).type('application/problem+json').json(problem);
  }

  private toProblem(exception: unknown, traceId: string): ProblemDetails {
    if (exception instanceof AppError) {
      return {
        type: TYPE_BASE + toKebab(exception.code),
        title: exception.message,
        status: exception.status,
        code: exception.code,
        traceId,
        errors: exception.errors,
        meta: exception.meta,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const code = defaultCodeFor(status);
      // ValidationPipe produces { message: string[] } — surface them as field errors.
      const messages =
        typeof body === 'object' && body !== null && 'message' in body ? body.message : undefined;
      const errors = Array.isArray(messages)
        ? messages.map((m) => ({ field: String(m).split(' ')[0] ?? '', message: String(m) }))
        : undefined;
      return {
        type: TYPE_BASE + toKebab(errors ? 'VALIDATION_FAILED' : code),
        title: errors ? 'Validation failed' : exception.message,
        status,
        code: errors ? 'VALIDATION_FAILED' : code,
        traceId,
        errors,
      };
    }

    return {
      type: TYPE_BASE + 'internal-error',
      title: 'An unexpected error occurred',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      traceId,
    };
  }
}
