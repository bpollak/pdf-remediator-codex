interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) store.delete(key);
  }
}

/**
 * Check whether a request from `ip` exceeds the rate limit.
 * Returns `{ allowed: true }` or `{ allowed: false, retryAfterSeconds }`.
 */
export function rateLimit(
  ip: string,
  limit: number,
  windowMs: number
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now();
  cleanup(now);

  const entry = store.get(ip);

  if (!entry || now >= entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  entry.count += 1;
  if (entry.count > limit) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true };
}

/**
 * Best-effort client IP. On Vercel the platform sets x-forwarded-for, so it
 * can be trusted there; elsewhere this is a heuristic.
 */
export function resolveClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'unknown';
}

/**
 * The app only calls its own API from its own pages. Browsers label requests
 * from other sites with Sec-Fetch-Site, so refuse those outright.
 */
export function isCrossSiteRequest(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  return site === 'cross-site' || site === 'same-site';
}

/**
 * Shared guard for API routes: refuses cross-site browser requests and
 * applies a per-route, per-IP rate limit. Returns a response to send when the
 * request is refused, otherwise undefined.
 */
export function guardApiRequest(
  request: Request,
  scope: string,
  limit: number,
  windowMs: number
): Response | undefined {
  if (isCrossSiteRequest(request)) {
    return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  }
  const rl = rateLimit(`${scope}:${resolveClientIp(request)}`, limit, windowMs);
  if (!rl.allowed) {
    return Response.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    );
  }
  return undefined;
}

/**
 * Backend service URLs must use HTTPS in production; plain HTTP is only
 * accepted for a loopback host.
 */
export function assertServiceUrlSafe(url: string, envName: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${envName} is not a valid URL.`);
  }
  if (parsed.protocol === 'https:') return;
  if (parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) return;
  if (process.env.NODE_ENV === 'development') return;
  throw new Error(`${envName} must use HTTPS in production.`);
}

/**
 * Status to return when a backend service fails. Auth failures between this
 * app and its backend are a server misconfiguration, not the caller's fault.
 */
export function upstreamErrorStatus(status: number): number {
  if (status === 401 || status === 403) return 502;
  return status >= 400 && status < 600 ? status : 502;
}
