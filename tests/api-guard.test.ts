import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  assertServiceUrlSafe,
  getRequestIdentity,
  guardApiRequest,
  MAX_RATE_LIMIT_ENTRIES,
  rateLimit,
  rateLimitEntryCountForTests,
  resolveClientIp,
  upstreamErrorStatus
} from '@/lib/rate-limit';
import { POST as altTextPost } from '@/app/api/alt-text/route';

function request(headers: Record<string, string> = {}) {
  return new Request('https://example.test/api/x', {
    method: 'POST',
    headers: { 'x-forwarded-for': crypto.randomUUID(), ...headers }
  });
}

describe('guardApiRequest', () => {
  it('refuses cross-site and same-site browser requests', async () => {
    for (const site of ['cross-site', 'same-site']) {
      const refused = guardApiRequest(request({ 'sec-fetch-site': site }), 'test', 5, 60_000);
      expect(refused?.status).toBe(403);
    }
  });

  it('allows same-origin requests and requests without the header', () => {
    expect(guardApiRequest(request({ 'sec-fetch-site': 'same-origin' }), 'test', 5, 60_000)).toBeUndefined();
    expect(guardApiRequest(request(), 'test', 5, 60_000)).toBeUndefined();
  });

  it('rate-limits per route, not across routes', () => {
    const ip = crypto.randomUUID();
    const make = () => request({ 'x-forwarded-for': ip });
    expect(guardApiRequest(make(), 'route-a', 1, 60_000)).toBeUndefined();
    expect(guardApiRequest(make(), 'route-a', 1, 60_000)?.status).toBe(429);
    expect(guardApiRequest(make(), 'route-b', 1, 60_000)).toBeUndefined();
  });
});

describe('guardApiRequest without Sec-Fetch-Site', () => {
  it('falls back to comparing Origin with the request host', async () => {
    const crossOrigin = guardApiRequest(request({ origin: 'https://evil.example' }), 'origin', 5, 60_000);
    expect(crossOrigin?.status).toBe(403);
    expect((await crossOrigin?.json())?.code).toBe('cross_site');

    expect(guardApiRequest(request({ origin: 'null' }), 'origin', 5, 60_000)?.status).toBe(403);
    expect(guardApiRequest(request({ origin: 'https://example.test' }), 'origin', 5, 60_000)).toBeUndefined();
    expect(
      guardApiRequest(request({ origin: 'https://pdf.ucsd.edu', host: 'pdf.ucsd.edu' }), 'origin', 5, 60_000)
    ).toBeUndefined();
  });

  it('trusts Sec-Fetch-Site over Origin when both are present', () => {
    expect(
      guardApiRequest(request({ 'sec-fetch-site': 'same-origin', origin: 'https://example.test' }), 'origin', 5, 60_000)
    ).toBeUndefined();
  });
});

describe('rate limiter', () => {
  it('returns a rate_limited code with Retry-After', async () => {
    const ip = crypto.randomUUID();
    guardApiRequest(request({ 'x-forwarded-for': ip }), 'code', 1, 60_000);
    const refused = guardApiRequest(request({ 'x-forwarded-for': ip }), 'code', 1, 60_000);
    expect(refused?.status).toBe(429);
    expect(refused?.headers.get('retry-after')).toBeTruthy();
    expect((await refused?.json())?.code).toBe('rate_limited');
  });

  it('caps the number of tracked clients, evicting the oldest', () => {
    const first = `first-${crypto.randomUUID()}`;
    rateLimit(first, 1, 60_000);
    expect(rateLimit(first, 1, 60_000).allowed).toBe(false);

    for (let i = 0; i < MAX_RATE_LIMIT_ENTRIES + 50; i += 1) {
      rateLimit(`flood-${i}`, 1, 60_000);
    }
    expect(rateLimitEntryCountForTests()).toBeLessThanOrEqual(MAX_RATE_LIMIT_ENTRIES);
    // The oldest key was evicted, so it starts a fresh window.
    expect(rateLimit(first, 1, 60_000).allowed).toBe(true);
  });
});

describe('resolveClientIp', () => {
  it('prefers the Vercel-set headers over X-Forwarded-For', () => {
    const headers = { 'x-forwarded-for': '6.6.6.6', 'x-real-ip': '2.2.2.2', 'x-vercel-forwarded-for': '1.1.1.1' };
    expect(resolveClientIp(new Request('https://example.test', { headers }))).toBe('1.1.1.1');
    expect(
      resolveClientIp(new Request('https://example.test', { headers: { 'x-forwarded-for': '6.6.6.6', 'x-real-ip': '2.2.2.2' } }))
    ).toBe('2.2.2.2');
    expect(resolveClientIp(new Request('https://example.test', { headers: { 'x-forwarded-for': '6.6.6.6, 7.7.7.7' } }))).toBe(
      '6.6.6.6'
    );
    expect(getRequestIdentity(new Request('https://example.test'))).toBe('ip:unknown');
  });
});

describe('assertServiceUrlSafe', () => {
  it('accepts HTTPS and loopback HTTP only', () => {
    expect(() => assertServiceUrlSafe('https://verapdf.example.org', 'X')).not.toThrow();
    expect(() => assertServiceUrlSafe('http://127.0.0.1:8081', 'X')).not.toThrow();
    expect(() => assertServiceUrlSafe('http://localhost:8081', 'X')).not.toThrow();
    // A prefix check used to let these through.
    expect(() => assertServiceUrlSafe('http://localhost.example.com', 'X')).toThrow(/HTTPS/);
    expect(() => assertServiceUrlSafe('http://127.0.0.1.example.com', 'X')).toThrow(/HTTPS/);
    expect(() => assertServiceUrlSafe('not a url', 'X')).toThrow(/valid URL/);
  });
});

describe('upstreamErrorStatus', () => {
  it('maps backend auth failures to 502 and keeps other errors', () => {
    expect(upstreamErrorStatus(401)).toBe(502);
    expect(upstreamErrorStatus(403)).toBe(502);
    expect(upstreamErrorStatus(413)).toBe(413);
    expect(upstreamErrorStatus(503)).toBe(503);
    expect(upstreamErrorStatus(302)).toBe(502);
  });
});

describe('/api/alt-text', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  function altTextRequest() {
    return new NextRequest('https://example.test/api/alt-text', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': crypto.randomUUID() },
      body: JSON.stringify({ imageDataUrl: 'data:image/png;base64,aGVsbG8=', imageLabel: 'Image 1' })
    });
  }

  it('tries the fallback model when the primary times out, and hides upstream detail', async () => {
    process.env = {
      ...originalEnv,
      LITELLM_API_KEY: 'test-key',
      LITELLM_MODEL: 'primary',
      LITELLM_FALLBACK_MODELS: 'fallback'
    };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.model === 'primary') {
        throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
      }
      return new Response('internal deployment azure-east-gpt is down', { status: 500 });
    });

    const response = await altTextPost(altTextRequest());
    const payload = await response.json();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(502);
    expect(payload.attemptedModels).toEqual([
      { model: 'primary', status: 504 },
      { model: 'fallback', status: 500 }
    ]);
    expect(JSON.stringify(payload)).not.toContain('azure-east-gpt');
  });

  it('reports a timeout when every model times out', async () => {
    process.env = { ...originalEnv, LITELLM_API_KEY: 'test-key', LITELLM_MODEL: 'only', LITELLM_FALLBACK_MODELS: '' };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));

    const response = await altTextPost(altTextRequest());
    expect(response.status).toBe(504);
  });
});
