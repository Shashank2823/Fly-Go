import { type ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { AppError } from '../errors/app-error';
import { ProblemDetailsFilter, type ProblemDetails } from './problem-details.filter';

function run(exception: unknown): { status: number; body: ProblemDetails; type: string } {
  const out = { status: 0, body: undefined as unknown as ProblemDetails, type: '' };
  const res = {
    status(code: number) {
      out.status = code;
      return this;
    },
    type(t: string) {
      out.type = t;
      return this;
    },
    json(body: ProblemDetails) {
      out.body = body;
      return this;
    },
  };
  const req = { headers: { 'x-request-id': 'trace-123' }, path: '/x' };
  const host = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
  new ProblemDetailsFilter().catch(exception, host);
  return out;
}

describe('ProblemDetailsFilter', () => {
  it('maps AppError to problem+json with its stable code and metadata', () => {
    const { status, body, type } = run(
      new AppError('SEATS_UNAVAILABLE', HttpStatus.CONFLICT, 'Seats unavailable', {
        unavailable: ['12B'],
      }),
    );
    expect(type).toBe('application/problem+json');
    expect(status).toBe(409);
    expect(body).toMatchObject({
      code: 'SEATS_UNAVAILABLE',
      type: 'https://flygo.dev/errors/seats-unavailable',
      traceId: 'trace-123',
      meta: { unavailable: ['12B'] },
    });
  });

  it('turns validation errors into field errors', () => {
    const { status, body } = run(new BadRequestException({ message: ['email must be an email'] }));
    expect(status).toBe(400);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.errors).toEqual([{ field: 'email', message: 'email must be an email' }]);
  });

  it('never leaks internal error messages for unknown errors', () => {
    const { status, body } = run(new Error('relation "users" does not exist at 10.0.0.5'));
    expect(status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('10.0.0.5');
  });
});
