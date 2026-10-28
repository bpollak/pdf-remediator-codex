import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { assertServiceUrlSafe, guardApiRequest, upstreamErrorStatus } from '@/lib/rate-limit';
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
