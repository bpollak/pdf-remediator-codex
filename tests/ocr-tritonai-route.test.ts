import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/ocr/tritonai/route';

const IMAGE_DATA_URL = 'data:image/png;base64,aGVsbG8=';

function makeRequest() {
  return new NextRequest('https://example.test/api/ocr/tritonai', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': crypto.randomUUID()
    },
    body: JSON.stringify({
      imageDataUrl: IMAGE_DATA_URL,
      page: 1,
      documentName: 'scan.pdf'
    })
  });
}

describe('/api/ocr/tritonai', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns a page-level warning instead of a hard failure when all OCR models fail', async () => {
    process.env = {
      ...originalEnv,
      OCR_LITELLM_API_KEY: 'test-key',
      OCR_LITELLM_BASE_URL: 'https://tritonai-api.ucsd.edu',
      OCR_LITELLM_MODEL: '',
      OCR_LITELLM_FALLBACK_MODELS: ''
    };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('model failed', {
        status: 400,
        headers: { 'content-type': 'text/plain' }
      })
    );

    const response = await POST(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      warning: 'TritonAI OCR could not extract usable text for this page.',
      lines: [],
      text: '',
      attemptedModels: [
        { model: 'api-lightonocr-1b', status: 400 },
        { model: 'api-mistral-small-3.2-2506', status: 400 },
        { model: 'api-gemma-4-26b', status: 400 }
      ]
    });
  });
});
