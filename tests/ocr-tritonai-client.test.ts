import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedPDF } from '@/lib/pdf/types';

vi.mock('@/lib/pdf/configure-worker', () => ({ ensurePdfJsWorkerConfigured: vi.fn() }));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      getPage: vi.fn(async () => ({
        getViewport: () => ({ width: 100, height: 140 }),
        render: () => ({ promise: Promise.resolve() }),
        cleanup: vi.fn()
      })),
      cleanup: vi.fn()
    }),
    destroy: vi.fn(() => Promise.resolve())
  }))
}));

import { __resetTritonOcrCircuitForTests, runTritonAiOcr } from '@/lib/ocr/tritonai';

function parsed(pageCount: number): ParsedPDF {
  return { pageCount, metadata: {}, hasStructTree: false, tags: [], textItems: [], images: [], links: [], outlines: [], forms: [] };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

const lines = (count: number) => ({ lines: Array.from({ length: count }, (_, index) => ({ text: `Line ${index + 1}` })) });

describe('TritonAI OCR client', () => {
  const globals = globalThis as unknown as { window?: unknown; document?: unknown };

  beforeAll(() => {
    globals.window = globalThis;
    globals.document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({}),
        toDataURL: () => 'data:image/png;base64,AAAA'
      })
    };
  });

  afterAll(() => {
    delete globals.window;
    delete globals.document;
  });

  beforeEach(() => {
    __resetTritonOcrCircuitForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('records how many pages were read, out of the whole document', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json(lines(4)));

    const result = await runTritonAiOcr(parsed(20), new ArrayBuffer(8), 'scan.pdf');
    expect(result.applied).toBe(true);
    // Only the first 8 pages are sent.
    expect(result).toMatchObject({ pagesProcessed: 8, totalPages: 20 });
  });

  it('stops after the first page when the service is not configured, and skips later files', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => json({ code: 'not_configured', error: 'Not configured (set OCR_LITELLM_API_KEY).' }, 503));

    const result = await runTritonAiOcr(parsed(5), new ArrayBuffer(8), 'scan.pdf');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ applied: false, pagesProcessed: 0, totalPages: 5 });
    expect(result.reason).not.toMatch(/OCR_LITELLM|LITELLM_API_KEY/);

    const later = await runTritonAiOcr(parsed(5), new ArrayBuffer(8), 'other.pdf');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(later.attempted).toBe(false);
  });

  it('also stops for rejected credentials from an older server without a code', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ error: 'Unauthorized' }, 401));

    await runTritonAiOcr(parsed(4), new ArrayBuffer(8), 'scan.pdf');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps going after an ordinary per-page failure', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => json({ code: 'upstream_timeout', error: 'Timed out.' }, 504))
      .mockImplementation(async () => json(lines(4)));

    const result = await runTritonAiOcr(parsed(3), new ArrayBuffer(8), 'scan.pdf');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.pagesProcessed).toBe(2);
  });

  it('honours Retry-After once on 429, then retries the page', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => json({ code: 'rate_limited', error: 'Slow down.' }, 429, { 'retry-after': '2' }))
      .mockImplementation(async () => json(lines(4)));

    const pending = runTritonAiOcr(parsed(2), new ArrayBuffer(8), 'scan.pdf');
    await vi.advanceTimersByTimeAsync(1_900);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    const result = await pending;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.pagesProcessed).toBe(2);
  });

  it('rejects with AbortError when the job is cancelled', async () => {
    const controller = new AbortController();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })
    );

    const pending = runTritonAiOcr(parsed(2), new ArrayBuffer(8), 'scan.pdf', undefined, { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
