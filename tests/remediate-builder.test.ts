import { describe, expect, it } from 'vitest';
import { buildRemediatedPdf } from '@/lib/remediate/builder';
import type { ParsedPDF } from '@/lib/pdf/types';

describe('buildRemediatedPdf', () => {
  it('handles characters outside WinAnsi encoding without throwing', async () => {
    const parsed: ParsedPDF = {
      pageCount: 1,
      metadata: {},
      hasStructTree: false,
      tags: [],
      textItems: [{ text: 'Budget \u25cf Analysis', x: 40, y: 720, width: 150, height: 12, fontName: 'Helvetica', fontSize: 12, page: 1 }],
      images: [],
      links: [],
      outlines: [],
      forms: []
    };

    const bytes = await buildRemediatedPdf(parsed, 'en-US');
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});
