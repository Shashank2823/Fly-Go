export interface FieldError {
  field: string;
  message: string;
}

/** RFC 9457 problem details as returned by the FlyGo API. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  traceId?: string;
  errors?: FieldError[];
  meta?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly traceId?: string;
  readonly errors: FieldError[];
  readonly meta?: Record<string, unknown>;

  constructor(problem: ProblemDetails) {
    super(problem.title);
    this.name = 'ApiError';
    this.status = problem.status;
    this.code = problem.code;
    this.traceId = problem.traceId;
    this.errors = problem.errors ?? [];
    this.meta = problem.meta;
  }

  /** Builds an ApiError from any failed response, even when the body is not problem+json. */
  static async fromResponse(res: Response): Promise<ApiError> {
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('json')) {
      try {
        const body = (await res.json()) as Partial<ProblemDetails>;
        if (typeof body.code === 'string' && typeof body.title === 'string') {
          return new ApiError({ ...body, status: res.status } as ProblemDetails);
        }
      } catch {
        // fall through to the generic error
      }
    }
    return new ApiError({
      type: 'about:blank',
      title: res.status >= 500 ? 'The service is temporarily unavailable' : 'Request failed',
      status: res.status,
      code: res.status >= 500 ? 'SERVICE_UNAVAILABLE' : 'HTTP_ERROR',
      traceId: res.headers.get('x-request-id') ?? undefined,
    });
  }
}
