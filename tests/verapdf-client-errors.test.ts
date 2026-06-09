import { afterEach, describe, expect, it, vi } from 'vitest';
import { runVerapdfViaApi } from '@/lib/verapdf/client';

function createSampleBytes(): ArrayBuffer {
  const bytes = new TextEncoder().encode('%PDF-1.4 sample');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe('runVerapdfViaApi error paths', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns service unavailable for 503 status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ attempted: false, reason: 'veraPDF verification service unavailable' }),
        { status: 503, headers: { 'content-type': 'application/json' } }
      )
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

  it('handles network errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await runVerapdfViaApi(createSampleBytes(), 'sample.pdf');
    expect(result.attempted).toBe(true);
    expect(result.reason).toBe('ECONNREFUSED');
  });

  it('handles AbortError (client timeout)', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);

    const result = await runVerapdfViaApi(createSampleBytes(), 'sample.pdf');
    expect(result.attempted).toBe(true);
    expect(result.reason).toBe('veraPDF verification timed out');
  });

  it('extracts detail from error response payload', async () => {
    // 502 is retried, so each fetch call needs a fresh Response with an unread body.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(
        JSON.stringify({
          error: 'veraPDF backend failed',
          detail: 'Connection refused to upstream host'
        }),
        { status: 502, headers: { 'content-type': 'application/json' } }
      )
    );

    const result = await runVerapdfViaApi(createSampleBytes(), 'sample.pdf');
    expect(result.attempted).toBe(true);
    expect(result.reason).toContain('Connection refused');
  });

  it('retries 502 then succeeds on second attempt', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'bad gateway' }), {
          status: 502,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            attempted: true,
            compliant: false,
            summary: { failedRules: 3, failedChecks: 7 }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );

    const result = await runVerapdfViaApi(createSampleBytes(), 'sample.pdf');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.compliant).toBe(false);
    expect(result.summary?.failedRules).toBe(3);
  });

  it('does not retry non-retryable status codes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'bad request' }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      )
    );

    const result = await runVerapdfViaApi(createSampleBytes(), 'sample.pdf');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.reason).toContain('bad request');
  });

  it('parses a compliant result with full summary', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          attempted: true,
          compliant: true,
          profile: 'PDF/UA-1',
          summary: { passedRules: 100, failedRules: 0, passedChecks: 500, failedChecks: 0 }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const result = await runVerapdfViaApi(createSampleBytes(), 'sample.pdf');
    expect(result.compliant).toBe(true);
    expect(result.profile).toBe('PDF/UA-1');
    expect(result.summary?.passedRules).toBe(100);
    expect(result.summary?.failedChecks).toBe(0);
  });
});
