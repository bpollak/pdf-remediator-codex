import { afterEach, describe, expect, it, vi } from 'vitest';
import { runVerapdfViaApi } from '@/lib/verapdf/client';

function createSampleBytes(): ArrayBuffer {
  const bytes = new TextEncoder().encode('%PDF-1.4 sample');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe('runVerapdfViaApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retries transient validation gateway failures and returns the parsed result on success', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            attempted: true,
            reason: 'veraPDF request timed out.'
          }),
          {
            status: 504,
            headers: { 'content-type': 'application/json' }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            attempted: true,
            compliant: true,
            summary: {
              failedRules: 0,
              failedChecks: 0
            }
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
      );

    const result = await runVerapdfViaApi(createSampleBytes(), 'sample.pdf');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.compliant).toBe(true);
    expect(result.summary?.failedRules).toBe(0);
    expect(result.summary?.failedChecks).toBe(0);
  });
});
