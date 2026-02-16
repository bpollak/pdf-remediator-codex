import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runAudit } from '@/lib/audit/engine';
import { isLikelyScannedPdf } from '@/lib/ocr/detection';
import { parsePdfBytes } from '@/lib/pdf/parser';
import { remediatePdf } from '@/lib/remediate/engine';

const scannedFixtures = ['scansmpl.pdf', 'Naac_appLetter-scanned.pdf'] as const;
const allFixtures = [...scannedFixtures] as const;

async function loadPdfBytes(fileName: string): Promise<ArrayBuffer> {
  const filePath = resolve(process.cwd(), 'public', fileName);
  const sourceBuffer = await readFile(filePath);
  return sourceBuffer.buffer.slice(sourceBuffer.byteOffset, sourceBuffer.byteOffset + sourceBuffer.byteLength);
}

function toArrayBuffer(bytes: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (bytes instanceof Uint8Array) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  return bytes;
}

function toNodeBuffer(bytes: ArrayBuffer | Uint8Array): Buffer {
  if (bytes instanceof Uint8Array) return Buffer.from(bytes);
  return Buffer.from(new Uint8Array(bytes));
}

describe('public fixture regression checks', () => {
  for (const fixtureName of scannedFixtures) {
    it(
      `${fixtureName} is detected as scanned and receives a low original score`,
      { timeout: 60000 },
      async () => {
        const sourceBytes = await loadPdfBytes(fixtureName);
        const parsed = await parsePdfBytes(sourceBytes.slice(0));
        const audit = runAudit(parsed);

        expect(isLikelyScannedPdf(parsed)).toBe(true);
        expect(audit.findings.some((finding) => finding.ruleId === 'DOC-004')).toBe(true);
        expect(audit.score).toBeLessThanOrEqual(20);
      }
    );
  }

  for (const fixtureName of allFixtures) {
    it(
      `${fixtureName} produces a distinct remediated PDF with a non-regressing score`,
      { timeout: 60000 },
      async () => {
        const sourceBytes = await loadPdfBytes(fixtureName);
        const originalParsed = await parsePdfBytes(sourceBytes.slice(0));
        const originalAudit = runAudit(originalParsed);

        const remediatedBytes = await remediatePdf(
          originalParsed,
          originalParsed.language ?? 'en-US',
          sourceBytes.slice(0)
        );
        const remediatedArrayBuffer = toArrayBuffer(remediatedBytes);
        const remediatedParsed = await parsePdfBytes(remediatedArrayBuffer.slice(0));
        const remediatedAudit = runAudit(remediatedParsed);

        expect(Buffer.compare(toNodeBuffer(sourceBytes), toNodeBuffer(remediatedArrayBuffer))).not.toBe(0);
        expect(remediatedParsed.hasStructTree).toBe(true);
        expect(remediatedAudit.findings.some((finding) => finding.ruleId === 'DOC-002')).toBe(false);
        expect(remediatedAudit.findings.some((finding) => finding.ruleId === 'DOC-004')).toBe(false);
        expect(remediatedAudit.score).toBeGreaterThanOrEqual(originalAudit.score);
      }
    );
  }
});
