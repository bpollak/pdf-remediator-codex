import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/verapdf/route';

function verapdfRequest(headers: Record<string, string> = {}) {
  const form = new FormData();
  form.append('file', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'a.pdf', { type: 'application/pdf' }));
  return new NextRequest('https://example.test/api/verapdf', {
    method: 'POST',
    headers: { 'x-forwarded-for': crypto.randomUUID(), ...headers },
    body: form
  });
}

describe('/api/verapdf', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('stops reading a report larger than 10 MB', async () => {
    process.env = { ...originalEnv, VERAPDF_SERVICE_URL: 'https://verapdf.example.org' };
    let pulled = 0;
    const chunk = new Uint8Array(1024 * 1024).fill(0x20);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith('/api/info')) return new Response('{}', { status: 200 });
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulled += 1;
          controller.enqueue(chunk);
        }
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const response = await POST(verapdfRequest());
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toMatchObject({ attempted: true, code: 'upstream_error' });
    expect(pulled).toBeLessThan(15);
  });

  it('refuses a declared body over the platform limit with 413 JSON', async () => {
    process.env = { ...originalEnv, VERAPDF_SERVICE_URL: 'https://verapdf.example.org' };
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const response = await POST(verapdfRequest({ 'content-length': String(6 * 1024 * 1024) }));

    expect(response.status).toBe(413);
    expect((await response.json()).code).toBe('payload_too_large');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a backend credentials failure to 502 upstream_auth', async () => {
    process.env = { ...originalEnv, VERAPDF_SERVICE_URL: 'https://verapdf.example.org' };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).endsWith('/api/info') ? new Response('{}') : new Response('nope', { status: 403 })
    );

    const response = await POST(verapdfRequest());
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe('upstream_auth');
  });

  it('does not name environment variables when not configured or misconfigured', async () => {
    process.env = { ...originalEnv, VERAPDF_SERVICE_URL: '', NODE_ENV: 'production' };
    for (const response of [await POST(verapdfRequest()), await GET(verapdfRequest())]) {
      const payload = await response.json();
      expect(response.status).toBe(503);
      expect(payload.code).toBe('not_configured');
      expect(typeof payload.reason).toBe('string');
      expect(JSON.stringify(payload)).not.toContain('VERAPDF_');
    }

    process.env = { ...originalEnv, VERAPDF_SERVICE_URL: 'http://verapdf.example.org', NODE_ENV: 'production' };
    const insecure = await POST(verapdfRequest());
    const payload = await insecure.json();
    expect(insecure.status).toBe(500);
    expect(payload.code).toBe('misconfigured');
    expect(JSON.stringify(payload)).not.toMatch(/VERAPDF_|HTTPS/);
  });
});
