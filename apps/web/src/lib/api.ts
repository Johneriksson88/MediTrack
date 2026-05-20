import { errorEnvelope, type ErrorEnvelope } from '@meditrack/shared';

/**
 * Pattern E + K — `fetchJson` is the single point of contact with the API.
 *
 * Behavior:
 *   - `credentials: 'include'` always, so the signed `meditrack.sid`
 *     cookie travels on every request (D-01, D-02).
 *   - On non-2xx: tries to parse the response body as the canonical error
 *     envelope (D-19). If it parses, throws `ApiError(status, envelope)`.
 *     If it doesn't, throws an `ApiError` with a synthetic envelope so
 *     the caller can still pattern-match on `err.envelope.error.code`.
 *   - The base URL respects `import.meta.env.VITE_API_URL`, which in
 *     dev is empty (Vite proxies `/api` → `http://localhost:3000`) and
 *     in a docker-compose deployment may be `http://api:3000` if the
 *     web container can't proxy itself (Task 5 documents the strategy
 *     it picks).
 */

export class ApiError extends Error {
  readonly status: number;
  readonly envelope: ErrorEnvelope;

  constructor(status: number, envelope: ErrorEnvelope) {
    super(envelope.error.message);
    this.name = 'ApiError';
    this.status = status;
    this.envelope = envelope;
  }
}

export function isUnauthenticated(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 401;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

function buildUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function fetchJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(buildUrl(path), {
    ...init,
    credentials: 'include',
    headers,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  // Try to parse the body for both success and error paths.
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const envParse = errorEnvelope.safeParse(parsed);
    const envelope: ErrorEnvelope = envParse.success
      ? envParse.data
      : {
          error: {
            code: 'unknown_error',
            message: `Begäran misslyckades (${res.status}).`,
          },
        };
    throw new ApiError(res.status, envelope);
  }

  return parsed as T;
}
