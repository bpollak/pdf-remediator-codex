import { jsonError } from '@/lib/server/http';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL_MS = 60_000;
// Bounds memory when many distinct clients (or spoofed IPs off Vercel) arrive
// within one window. The Map keeps insertion order, so the first key is the oldest.
export const MAX_RATE_LIMIT_ENTRIES = 10_000;
let lastCleanup = Date.now();

function cleanup(now: number, force = false): void {
  if (!force && now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) store.delete(key);
  }
}

function insertEntry(key: string, entry: RateLimitEntry, now: number): void {
  // Re-inserting moves the key to the end, so eviction order stays oldest first.
  store.delete(key);
  if (store.size >= MAX_RATE_LIMIT_ENTRIES) {
    cleanup(now, true);
    while (store.size >= MAX_RATE_LIMIT_ENTRIES) {
      const oldest = store.keys().next().value;
      if (oldest === undefined) break;
      store.delete(oldest);
    }
  }
  store.set(key, entry);
}

export function rateLimitEntryCountForTests(): number {
  return store.size;
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
    insertEntry(ip, { count: 1, resetAt: now + windowMs }, now);
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
 * Best-effort client IP.
 *
 * Trust assumption: on Vercel the platform sets x-vercel-forwarded-for and
 * x-real-ip itself and overwrites any client-supplied x-forwarded-for, so all
 * three name the real client there. Anywhere else (local, self-hosted without
 * a proxy that rewrites these headers) the client controls them, so the
 * per-IP limit is only a heuristic and can be bypassed by rotating headers.
 */
export function resolveClientIp(request: Request): string {
  const vercelForwarded = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  if (vercelForwarded) return vercelForwarded;
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'unknown';
}

/**
 * Who the rate limit counts against. Today that is the client IP; once the
 * app has sign-in, a user id can be returned here instead.
 */
export function getRequestIdentity(request: Request): string {
  return `ip:${resolveClientIp(request)}`;
}

function requestHosts(request: Request): string[] {
  const hosts: string[] = [];
  // A reverse proxy may rewrite Host and keep the public one in X-Forwarded-Host.
  for (const name of ['host', 'x-forwarded-host']) {
    const value = request.headers.get(name)?.split(',')[0]?.trim().toLowerCase();
    if (value) hosts.push(value);
  }
  try {
    hosts.push(new URL(request.url).host.toLowerCase());
  } catch {
    // A relative or invalid URL leaves only the Host header to compare.
  }
  return hosts;
}

/**
 * The app only calls its own API from its own pages. Browsers label requests
 * from other sites with Sec-Fetch-Site, so refuse those outright. Older
 * browsers that omit Sec-Fetch-Site still send Origin on cross-origin POSTs,
 * so compare it with the request host. Requests with neither header (curl,
 * server-to-server) are not browser CSRF and are left to the rate limit.
 */
export function isCrossSiteRequest(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site) return site === 'cross-site' || site === 'same-site';

  const origin = request.headers.get('origin');
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    // "null" (sandboxed frames, some redirects) or garbage.
    return true;
  }
  return !originHost || !requestHosts(request).includes(originHost);
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
    return jsonError(403, 'cross_site', { error: 'Cross-site requests are not allowed.' });
  }
  const rl = rateLimit(`${scope}:${getRequestIdentity(request)}`, limit, windowMs);
  if (!rl.allowed) {
    return jsonError(
      429,
      'rate_limited',
      { error: 'Too many requests. Please try again later.' },
      { 'Retry-After': String(rl.retryAfterSeconds) }
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
