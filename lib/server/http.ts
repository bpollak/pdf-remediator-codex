/**
 * Stable, machine-readable error codes returned by the API routes. Clients
 * should branch on `code`; the human-readable text may change.
 */
export type ApiErrorCode =
  | 'invalid_request'
  | 'payload_too_large'
  | 'rate_limited'
  | 'cross_site'
  | 'not_configured'
  | 'misconfigured'
  | 'upstream_auth'
  | 'upstream_timeout'
  | 'upstream_error'
  | 'internal_error';

/**
 * JSON error response. `body` keeps each route's existing fields (`error`,
 * `reason`, `hint`, ...) so current clients keep working; `code` is added.
 * Responses never name environment variables or other configuration detail;
 * that goes to the server log instead.
 */
export function jsonError(
  status: number,
  code: ApiErrorCode,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): Response {
  return Response.json({ ...body, code }, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

/** Error code for a failed backend response, by its HTTP status. */
export function upstreamErrorCode(status: number): ApiErrorCode {
  if (status === 401 || status === 403) return 'upstream_auth';
  if (status === 413) return 'payload_too_large';
  if (status === 504) return 'upstream_timeout';
  return 'upstream_error';
}

// Vercel Functions refuse request bodies over 4.5 MB before the route runs.
export const PLATFORM_MAX_BODY_BYTES = 4.5 * 1024 * 1024;

/** True when the declared Content-Length is larger than the route accepts. */
export function contentLengthExceeds(request: Request, maxBytes: number): boolean {
  const raw = request.headers.get('content-length');
  if (!raw || !/^\d+$/.test(raw)) return false;
  return Number(raw) > maxBytes;
}

/**
 * Reads a response body as text, giving up (and cancelling the body) once it
 * passes `maxBytes`. Returns undefined when the body is too large.
 */
export async function readTextCapped(response: Response, maxBytes: number): Promise<string | undefined> {
  const declared = response.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    return undefined;
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return undefined;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}
