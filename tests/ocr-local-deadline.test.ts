import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ParsedPDF } from '@/lib/pdf/types';

const { createWorker } = vi.hoisted(() => ({ createWorker: vi.fn() }));

vi.mock('tesseract.js', () => ({ createWorker }));
vi.mock('@/lib/pdf/configure-worker', () => ({ ensurePdfJsWorkerConfigured: vi.fn() }));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      getPage: vi.fn(async () => ({
        getViewport: () => ({ width: 100, height: 140, convertToPdfPoint: (x: number, y: number) => [x, y] }),
        render: () => ({ promise: Promise.resolve() }),
        cleanup: vi.fn()
      })),
      cleanup: vi.fn()
    }),
    destroy: vi.fn(() => Promise.resolve())
  }))
}));

import { runLocalOcr } from '@/lib/ocr/local';

const SHORT_TIMEOUTS = { setupTimeoutMs: 50, pageTimeoutMs: 50 };

const parsed: ParsedPDF = { pageCount: 3, metadata: {}, hasStructTree: false, tags: [], textItems: [], images: [], links: [], outlines: [], forms: [] };

describe('local OCR deadlines', () => {
  const globals = globalThis as unknown as { window?: unknown; document?: unknown };

  beforeAll(() => {
    globals.window = globalThis;
    globals.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({}) }) };
  });

  afterAll(() => {
    delete globals.window;
    delete globals.document;
  });

  afterEach(() => {
    createWorker.mockReset();
  });

  it('gives up when the OCR engine never finishes downloading, and shuts it down if it starts late', async () => {
    const terminate = vi.fn(async () => undefined);
    let startWorker: (worker: unknown) => void = () => undefined;
    createWorker.mockImplementation(() => new Promise((resolve) => (startWorker = resolve)));

    const result = await runLocalOcr(parsed, new ArrayBuffer(8), undefined, SHORT_TIMEOUTS);
    expect(result).toMatchObject({ attempted: true, applied: false, pagesProcessed: 0, totalPages: 3 });
    expect(result.reason).toMatch(/did not finish/);

    startWorker({ terminate, recognize: vi.fn() });
    await vi.waitFor(() => expect(terminate).toHaveBeenCalled());
  });

  it('stops a page that never finishes and reports the pages read so far', async () => {
    const terminate = vi.fn(async () => undefined);
    const recognize = vi
      .fn()
      .mockResolvedValueOnce({ data: { lines: [{ text: 'Page one text', confidence: 90, bbox: { x0: 0, y0: 0, x1: 50, y1: 10 } }] } })
      .mockImplementation(() => new Promise(() => undefined));
    createWorker.mockResolvedValue({ terminate, recognize });

    const result = await runLocalOcr(parsed, new ArrayBuffer(8), undefined, SHORT_TIMEOUTS);
    expect(result).toMatchObject({ applied: false, pagesProcessed: 1, totalPages: 3 });
    expect(terminate).toHaveBeenCalled();
  });

  it('rejects with AbortError when cancelled', async () => {
    const controller = new AbortController();
    createWorker.mockResolvedValue({ terminate: vi.fn(async () => undefined), recognize: () => new Promise(() => undefined) });

    const pending = runLocalOcr(parsed, new ArrayBuffer(8), undefined, { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
