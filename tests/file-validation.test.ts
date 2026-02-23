import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validatePdfFile } from '@/lib/utils/file-helpers';

function fixture(path: string): Uint8Array {
  return readFileSync(path);
}

describe('PDF upload validation', () => {
  it('accepts known fixture PDFs', async () => {
    const files = [
      new File([fixture('fixtures/accessible.pdf')], 'accessible.pdf', { type: 'application/pdf' }),
      new File([fixture('fixtures/partial.pdf')], 'partial.pdf', { type: 'application/pdf' }),
      new File([fixture('fixtures/untagged.pdf')], 'untagged.pdf', { type: 'application/pdf' })
    ];

    for (const file of files) {
      const result = await validatePdfFile(file);
      expect(result.ok).toBe(true);
    }
  });

  it('accepts PDFs with long preamble when MIME type is PDF', async () => {
    const bytes = fixture('fixtures/accessible.pdf');
    const preamble = new Uint8Array(8 * 1024).fill(0x20);
    const delayedHeaderBytes = new Uint8Array(preamble.length + bytes.length);
    delayedHeaderBytes.set(preamble, 0);
    delayedHeaderBytes.set(bytes, preamble.length);

    const file = new File([delayedHeaderBytes], 'delayed-header.pdf', { type: 'application/pdf' });
    const result = await validatePdfFile(file);

    expect(result.ok).toBe(true);
  });

  it('rejects non-PDF files masquerading as .pdf when MIME type is not PDF', async () => {
    const textBytes = new TextEncoder().encode('hello world');
    const file = new File([textBytes], 'not-a-pdf.pdf', { type: 'text/plain' });
    const result = await validatePdfFile(file);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('does not look like a valid PDF');
  });
});
