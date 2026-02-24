import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetOcrApiCircuitForTests, runOcrViaApi } from '@/lib/ocr/client';

function createSampleBytes(): ArrayBuffer {
  const bytes = new TextEncoder().encode('%PDF-1.4 sample');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe('runOcrViaApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    __resetOcrApiCircuitForTests();
  });

  it('opens a cooldown circuit after OCR service unavailable status', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('unavailable', { status: 503, headers: { 'content-type': 'text/plain' } })
    );

    const first = await runOcrViaApi(createSampleBytes(), 'sample.pdf', 'en-US');
    const second = await runOcrViaApi(createSampleBytes(), 'sample.pdf', 'en-US');

    expect(first.attempted).toBe(true);
    expect(first.reason).toBe('OCR service unavailable');
    expect(second.attempted).toBe(false);
    expect(second.reason).toBe('OCR service unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries transient gateway failures and returns OCR bytes on success', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('temporary bad gateway', { status: 502 }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { 'content-type': 'application/pdf' }
        })
      );

    const result = await runOcrViaApi(createSampleBytes(), 'sample.pdf', 'en-US');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.attempted).toBe(true);
    expect(result.bytes).toBeDefined();
    expect(result.bytes?.byteLength).toBe(4);
  });
});
