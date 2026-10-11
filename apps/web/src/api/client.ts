import { ApiError } from './api-error';

const BASE = '/api/v1';
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Required by the API for booking/payment creation (docs §11). */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Treat these non-2xx statuses as a successful response body (e.g. health 503). */
  acceptStatuses?: number[];
}

// ── CSRF token (synchronizer pattern, docs §8.2) ───────────────────────────
// Held in memory only; the session cookie itself is HttpOnly and invisible to JS.
let csrfToken: string | null = null;
let csrfRequest: Promise<string> | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

async function ensureCsrfToken(forceRefresh = false): Promise<string> {
  if (csrfToken && !forceRefresh) return csrfToken;
  csrfRequest ??= fetch(`${BASE}/auth/csrf`, { credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) throw await ApiError.fromResponse(res);
      return ((await res.json()) as { csrfToken: string }).csrfToken;
    })
    .finally(() => {
      csrfRequest = null;
    });
  csrfToken = await csrfRequest;
  return csrfToken;
}

async function send(path: string, options: RequestOptions, csrf?: string): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  if (csrf) headers['X-CSRF-Token'] = csrf;

  try {
    return await fetch(BASE + path, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError({
      type: 'about:blank',
      title: 'Unable to reach FlyGo. Check your connection and try again.',
      status: 0,
      code: 'NETWORK_ERROR',
    });
  }
}

/**
 * The single HTTP entry point for the SPA: sends the session cookie, CSRF token and
 * idempotency keys, and turns failures into typed ApiErrors. A rejected CSRF token
 * (e.g. after the session expired) is refreshed and the request retried once.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const unsafe = UNSAFE.has(options.method ?? 'GET');
  let res = await send(path, options, unsafe ? await ensureCsrfToken() : undefined);

  if (unsafe && res.status === 403) {
    const err = await ApiError.fromResponse(res.clone());
    if (err.code === 'CSRF_TOKEN_INVALID') {
      res = await send(path, options, await ensureCsrfToken(true));
    }
  }

  if (!res.ok && !options.acceptStatuses?.includes(res.status)) {
    throw await ApiError.fromResponse(res);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
