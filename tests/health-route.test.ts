import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/health/route';

function healthRequest() {
  return new NextRequest('https://example.test/api/health', { headers: { 'x-forwarded-for': crypto.randomUUID() } });
}

describe('/api/health', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('reports configured services and the short commit without calling out or leaking settings', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      LITELLM_API_KEY: 'sk-secret-value',
      OCR_LITELLM_API_KEY: '',
      OCR_SERVICE_URL: 'https://ocr.example.org/ocr',
      VERAPDF_SERVICE_URL: 'http://verapdf.example.org',
      VERCEL_GIT_COMMIT_SHA: '0123456789abcdef',
      APP_COMMIT_SHA: ''
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const response = await GET(healthRequest());
    const payload = await response.json();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload).toEqual({
      ok: true,
      services: { altText: true, ocr: true, tritonAiOcr: true, verapdf: false },
      version: '0123456'
    });
    expect(JSON.stringify(payload)).not.toMatch(/sk-secret|example\.org/);
  });

  it('reports the commit inlined at build time for CLI deployments', async () => {
    process.env = { ...originalEnv, NODE_ENV: 'production', VERCEL_GIT_COMMIT_SHA: '', APP_COMMIT_SHA: 'fedcba9876543210' };
    const payload = await (await GET(healthRequest())).json();
    expect(payload.version).toBe('fedcba9');
  });

  it('reports false for unconfigured services and omits version when unknown', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      LITELLM_API_KEY: '',
      TRITONAI_API_KEY: '',
      OCR_LITELLM_API_KEY: '',
      OCR_SERVICE_URL: '',
      VERAPDF_SERVICE_URL: '',
      VERCEL_GIT_COMMIT_SHA: '',
      APP_COMMIT_SHA: ''
    };

    const payload = await (await GET(healthRequest())).json();
    expect(payload).toEqual({
      ok: true,
      services: { altText: false, ocr: false, tritonAiOcr: false, verapdf: false }
    });
  });
});
