import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePdfBytes } from '@/lib/pdf/parser';
import { remediatePdf } from '@/lib/remediate/engine';
import { createByteFingerprint } from '@/lib/remediate/loop';

async function loadFixtureBytes(fileName: string): Promise<ArrayBuffer> {
  const fixturePath = resolve(process.cwd(), 'fixtures', fileName);
  const sourceBuffer = await readFile(fixturePath);
  return sourceBuffer.buffer.slice(sourceBuffer.byteOffset, sourceBuffer.byteOffset + sourceBuffer.byteLength);
}

describe('PDF byte ownership', () => {
  it('keeps caller-owned source bytes reusable after parse and remediation', { timeout: 30000 }, async () => {
    const sourceBytes = await loadFixtureBytes('untagged.pdf');
    const originalFingerprint = createByteFingerprint(sourceBytes);

    const parsed = await parsePdfBytes(sourceBytes);
    expect(parsed.pageCount).toBeGreaterThan(0);
    expect(() => new File([sourceBytes], 'source.pdf', { type: 'application/pdf' })).not.toThrow();
    expect(createByteFingerprint(sourceBytes)).toBe(originalFingerprint);

    const remediatedBytes = await remediatePdf(parsed, parsed.language ?? 'en-US', sourceBytes);
    const remediatedByteLength =
      remediatedBytes instanceof Uint8Array ? remediatedBytes.byteLength : remediatedBytes.byteLength;

    expect(remediatedByteLength).toBeGreaterThan(0);
    expect(() => sourceBytes.slice(0)).not.toThrow();
    expect(() => new File([sourceBytes], 'source.pdf', { type: 'application/pdf' })).not.toThrow();
    expect(createByteFingerprint(sourceBytes)).toBe(originalFingerprint);
  });
});
