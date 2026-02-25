import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runAudit } from '@/lib/audit/engine';
import { parsePdfBytes } from '@/lib/pdf/parser';
import { remediatePdf } from '@/lib/remediate/engine';

describe('pipeline integration', () => {
  it('parse -> audit -> remediate -> re-audit avoids unbound structure regressions', { timeout: 30000 }, async () => {
    const fixturePath = resolve(process.cwd(), 'fixtures/untagged.pdf');
    const sourceBuffer = await readFile(fixturePath);
    const sourceBytes = sourceBuffer.buffer.slice(
      sourceBuffer.byteOffset,
      sourceBuffer.byteOffset + sourceBuffer.byteLength
    );

    const originalParsed = await parsePdfBytes(sourceBytes.slice(0));
    const before = runAudit(originalParsed);

    const remediatedBytes = await remediatePdf(
      originalParsed,
      originalParsed.language ?? 'en-US',
      sourceBytes.slice(0)
    );

    const remediatedArrayBuffer =
      remediatedBytes instanceof Uint8Array
        ? remediatedBytes.buffer.slice(remediatedBytes.byteOffset, remediatedBytes.byteOffset + remediatedBytes.byteLength)
        : remediatedBytes;

    const reparsed = await parsePdfBytes(remediatedArrayBuffer.slice(0));
    const after = runAudit(reparsed);

    expect(after.score).toBeGreaterThanOrEqual(before.score);
    expect(after.findings.some((finding) => finding.ruleId === 'DOC-005')).toBe(false);
  });
});
