import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import zlib from 'node:zlib';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/ocr/route';

const pdf = Buffer.from(`%PDF-1.7\n${'A'.repeat(50_000)}\n%%EOF`);
let server: http.Server;
let port = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      if (req.url === '/gzip') {
        const gz = zlib.gzipSync(pdf);
        res.writeHead(200, { 'content-type': 'application/pdf', 'content-encoding': 'gzip', 'content-length': gz.length });
        res.end(gz);
      } else if (req.url === '/stall') {
        res.writeHead(200, { 'content-type': 'application/pdf' });
        res.write('%PDF-1.7\n'); // and never finish
      } else if (req.url === '/unauthorized') {
        res.writeHead(401, { 'content-type': 'text/plain' });
        res.end('bad token for worker-internal-7');
      } else {
        res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': pdf.length });
        res.end(pdf);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  port = (server.address() as { port: number }).port;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe('/api/ocr proxy', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  function call(path: string, headers: Record<string, string> = {}, env: Record<string, string> = {}) {
    process.env = { ...originalEnv, OCR_SERVICE_URL: `http://127.0.0.1:${port}${path}`, ...env };
    const form = new FormData();
    form.append('file', new File([pdf], 'a.pdf', { type: 'application/pdf' }));
    return POST(
      new NextRequest('https://example.test/api/ocr', {
        method: 'POST',
        headers: { 'x-forwarded-for': crypto.randomUUID(), ...headers },
        body: form
      })
    );
  }

  it('does not forward the upstream content-length, so a decoded gzip body is not truncated', async () => {
    const response = await call('/gzip');
    const body = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBeNull();
    expect(body.equals(pdf)).toBe(true);
  });

  it('keeps the timeout armed while the body streams, so a stalled backend is aborted', async () => {
    const response = await call('/stall', {}, { OCR_TIMEOUT_MS: '1000' });
    expect(response.status).toBe(200);

    const outcome = await Promise.race([
      response.arrayBuffer().then(
        () => 'finished',
        () => 'aborted'
      ),
      new Promise((resolve) => setTimeout(() => resolve('still-hanging'), 4000))
    ]);
    expect(outcome).toBe('aborted');
  });

  it('streams a normal PDF through', async () => {
    const response = await call('/ok');
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await response.arrayBuffer()).equals(pdf)).toBe(true);
  });

  it('maps a backend credentials failure to 502 upstream_auth without upstream detail', async () => {
    const response = await call('/unauthorized');
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.code).toBe('upstream_auth');
    expect(JSON.stringify(payload)).not.toContain('worker-internal-7');
  });

  it('refuses a declared body over the platform limit with 413 JSON', async () => {
    const response = await call('/ok', { 'content-length': String(6 * 1024 * 1024) });
    expect(response.status).toBe(413);
    expect((await response.json()).code).toBe('payload_too_large');
  });

  it('does not name environment variables when unconfigured or misconfigured', async () => {
    process.env = { ...originalEnv, OCR_SERVICE_URL: '' };
    const missing = await POST(new NextRequest('https://example.test/api/ocr', { method: 'POST' }));
    const missingPayload = await missing.json();
    expect(missing.status).toBe(503);
    expect(missingPayload.code).toBe('not_configured');
    expect(JSON.stringify(missingPayload)).not.toContain('OCR_SERVICE_URL');

    process.env = { ...originalEnv, OCR_SERVICE_URL: 'http://ocr.example.com/ocr' };
    const insecure = await POST(new NextRequest('https://example.test/api/ocr', { method: 'POST' }));
    const insecurePayload = await insecure.json();
    expect(insecure.status).toBe(500);
    expect(insecurePayload.code).toBe('misconfigured');
    expect(JSON.stringify(insecurePayload)).not.toMatch(/OCR_SERVICE_URL|HTTPS/);
  });
});
