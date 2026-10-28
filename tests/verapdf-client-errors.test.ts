import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VERAPDF_MAX_UPLOAD_BYTES,
  VERAPDF_TOO_LARGE_REASON,
  __resetVerapdfCircuitForTests,
  runVerapdfViaApi
} from '@/lib/verapdf/client';
import { decideRemediationLoop } from '@/lib/remediate/loop';

function createSampleBytes(): ArrayBuffer {
  const bytes = new TextEncoder().encode('%PDF-1.4 sample');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('runVerapdfViaApi error paths', () => {
  beforeEach(() => {
    __resetVerapdfCircuitForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns service unavailable for 503 status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ attempted: false, reason: 'veraPDF verification service unavailable' }, 503)
    );

    const result = await runVerapdfViaApi(createSampleBytes(), 'sample.pdf');
    expect(result.attempted).toBe(false);
    expect(result.reason).toContain('unavailable');
  });

  it('handles malformed JSON response gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('this is not json {{{', {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );

    const result = await runVerapdfViaApi(createSampleBytes(), 'sample.pdf');
    expect(result.attempted).toBe(true);
    expect(result.reason).toContain('unexpected response');
  });

  it('treats network errors as service unavailable, so the loop stops', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    const pending = runVerapdfViaApi(createSampleBytes(), 'sample.pdf');
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.attempted).toBe(false);
    expect(result.reason).toMatch(/unavailable/);
    expect(decideRemediationLoop({ iteration: 1, maxIterations: 3, verapdfResult: result })).toEqual({
      continue: false,
      reason: 'service_unavailable'
    });
  });

  it('treats a client timeout as service unavailable without waiting again', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);

    const result = await runVerapdfViaApi(createSampleBytes(), 'sample.pdf');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.attempted).toBe(false);
    expect(result.reason).toMatch(/timed out/);
  });

  it('treats Vercel’s plain-text 413 as too large, not as an attempted validation', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response('Request Entity Too Large', { status: 413, headers: { 'content-type': 'text/plain' } })
    );

    const result = await runVerapdfViaApi(createSampleBytes(), 'sample.pdf');
    expect(result).toEqual({ attempted: false, reason: VERAPDF_TOO_LARGE_REASON });
    expect(decideRemediationLoop({ iteration: 1, maxIterations: 3, verapdfResult: result }).continue).toBe(false);
  });

  it('skips PDFs over the upload limit without calling the server', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const result = await runVerapdfViaApi(new ArrayBuffer(VERAPDF_MAX_UPLOAD_BYTES + 1), 'big.pdf');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.attempted).toBe(false);
    expect(result.reason).toMatch(/PAC or Acrobat/);
  });

  it('stops calling a service that is down (circuit breaker), but not after a too-large file', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('Too large', { status: 413 }));
    await runVerapdfViaApi(createSampleBytes(), 'a.pdf');
    await runVerapdfViaApi(createSampleBytes(), 'b.pdf');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockImplementation(async () => json({ code: 'not_configured', error: 'Online verification is not set up.' }, 503));
    await runVerapdfViaApi(createSampleBytes(), 'c.pdf');
    const skipped = await runVerapdfViaApi(createSampleBytes(), 'd.pdf');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(skipped.attempted).toBe(false);
  });

  it('handles the stable error codes from the server', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(json({ code: 'payload_too_large', error: 'Too large.' }, 413));
    expect((await runVerapdfViaApi(createSampleBytes(), 'a.pdf')).reason).toBe(VERAPDF_TOO_LARGE_REASON);

    fetchMock.mockResolvedValueOnce(json({ code: 'upstream_auth', error: 'Rejected.' }, 502));
    const auth = await runVerapdfViaApi(createSampleBytes(), 'b.pdf');
    expect(auth.attempted).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    __resetVerapdfCircuitForTests();
    fetchMock.mockResolvedValueOnce(json({ code: 'rate_limited', error: 'Slow down.' }, 429, { 'retry-after': '30' }));
    const busy = await runVerapdfViaApi(createSampleBytes(), 'c.pdf');
    expect(busy.attempted).toBe(false);
    expect(busy.reason).toMatch(/busy/);
  });

  it('rejects with AbortError when the caller cancels', async () => {
    const controller = new AbortController();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })
    );

    const pending = runVerapdfViaApi(createSampleBytes(), 'sample.pdf', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('extracts detail from error response payload', async () => {
    // 502 is retried, so each fetch call needs a fresh Response with an unread body.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      json({ error: 'veraPDF backend failed', detail: 'Connection refused to upstream host' }, 502)
    );

    const result = await runVerapdfViaApi(createSampleBytes(), 'sample.pdf');
    expect(result.attempted).toBe(false);
    expect(result.reason).toContain('Connection refused');
  });

  it('retries 502 then succeeds on second attempt', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ error: 'bad gateway' }, 502))
      .mockResolvedValueOnce(json({ attempted: true, compliant: false, summary: { failedRules: 3, failedChecks: 7 } }, 200));

    const result = await runVerapdfViaApi(createSampleBytes(), 'sample.pdf');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.compliant).toBe(false);
    expect(result.summary?.failedRules).toBe(3);
  });

  it('does not retry non-retryable status codes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: 'bad request' }, 400));

    const result = await runVerapdfViaApi(createSampleBytes(), 'sample.pdf');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.reason).toContain('bad request');
  });

  it('parses a compliant result with full summary', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(
        {
          attempted: true,
          compliant: true,
          profile: 'PDF/UA-1',
          summary: { passedRules: 100, failedRules: 0, passedChecks: 500, failedChecks: 0 }
        },
        200
      )
    );

    const result = await runVerapdfViaApi(createSampleBytes(), 'sample.pdf');
    expect(result.compliant).toBe(true);
    expect(result.profile).toBe('PDF/UA-1');
    expect(result.summary?.passedRules).toBe(100);
    expect(result.summary?.failedChecks).toBe(0);
  });
});
