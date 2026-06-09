import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetOcrApiCircuitForTests, runOcrViaApi } from '@/lib/ocr/client';

function createSampleBytes(): ArrayBuffer {
  const bytes = new TextEncoder().encode('%PDF-1.4 sample');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe('runOcrViaApi error paths', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    __resetOcrApiCircuitForTests();
  });

  it('returns specific message for 413 payload too large', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('too large', { status: 413, headers: { 'content-type': 'text/plain' } })
    );

    const result = await runOcrViaApi(createSampleBytes(), 'big.pdf', 'en-US');
    expect(result.attempted).toBe(true);
    expect(result.reason).toContain('too large for the OCR service');
    expect(result.bytes).toBeUndefined();
  });

  it('returns specific message for 504 timeout', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('timeout', { status: 504, headers: { 'content-type': 'text/plain' } })
    );

    // 504 is retryable, so it will retry MAX_RETRIES times then give up
    const result = await runOcrViaApi(createSampleBytes(), 'slow.pdf', 'en-US');
    expect(result.attempted).toBe(true);
    expect(result.reason).toBe('OCR request timed out');
  });

  it('returns specific message for 404 not found and opens circuit', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } })
    );

    const first = await runOcrViaApi(createSampleBytes(), 'sample.pdf', 'en-US');
    expect(first.attempted).toBe(true);
    expect(first.reason).toBe('OCR service unavailable');

    // Second call should be circuit-breaker short-circuited
    const second = await runOcrViaApi(createSampleBytes(), 'sample.pdf', 'en-US');
    expect(second.attempted).toBe(false);
    expect(second.reason).toBe('OCR service unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns specific message for 501 not implemented and opens circuit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not implemented', { status: 501, headers: { 'content-type': 'text/plain' } })
    );

    const result = await runOcrViaApi(createSampleBytes(), 'sample.pdf', 'en-US');
    expect(result.attempted).toBe(true);
    expect(result.reason).toBe('OCR service unavailable');
  });

  it('rejects non-PDF response content types', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error": "oops"}', {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );

    const result = await runOcrViaApi(createSampleBytes(), 'sample.pdf', 'en-US');
    expect(result.attempted).toBe(true);
    expect(result.reason).toBe('OCR response was not a PDF');
    expect(result.bytes).toBeUndefined();
  });

  it('rejects empty PDF response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array(0), {
        status: 200,
        headers: { 'content-type': 'application/pdf' }
      })
    );

    const result = await runOcrViaApi(createSampleBytes(), 'sample.pdf', 'en-US');
    expect(result.attempted).toBe(true);
    expect(result.reason).toBe('OCR returned an empty PDF');
  });

  it('handles network errors with retry and eventual failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await runOcrViaApi(createSampleBytes(), 'sample.pdf', 'en-US');
    expect(result.attempted).toBe(true);
    expect(result.reason).toBe('ECONNREFUSED');
  });

  it('handles AbortError (client timeout) with retry', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);

    const result = await runOcrViaApi(createSampleBytes(), 'sample.pdf', 'en-US');
    expect(result.attempted).toBe(true);
    expect(result.reason).toBe('OCR request timed out');
  });

  it('returns generic message for unexpected status codes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('bad request', { status: 400, headers: { 'content-type': 'text/plain' } })
    );

    const result = await runOcrViaApi(createSampleBytes(), 'sample.pdf', 'en-US');
    expect(result.attempted).toBe(true);
    expect(result.reason).toBe('OCR request failed (400)');
  });
});
