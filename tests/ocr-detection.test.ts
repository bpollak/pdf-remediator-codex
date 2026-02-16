import { describe, expect, it } from 'vitest';
import { isLikelyScannedPdf } from '@/lib/ocr/detection';
import type { ParsedPDF } from '@/lib/pdf/types';

function createBaseParsed(): ParsedPDF {
  return {
    pageCount: 3,
    metadata: {},
    hasStructTree: false,
    tags: [],
    textItems: [],
    images: [],
    links: [],
    outlines: [],
    forms: []
  };
}

describe('isLikelyScannedPdf', () => {
  it('returns true when document has very low text density and no semantic signals', () => {
    const parsed = createBaseParsed();
    parsed.textItems = [
      { text: 'A', x: 10, y: 700, width: 10, height: 10, fontName: 'Helvetica', fontSize: 10, page: 1 },
      { text: 'B', x: 10, y: 700, width: 10, height: 10, fontName: 'Helvetica', fontSize: 10, page: 2 }
    ];

    expect(isLikelyScannedPdf(parsed)).toBe(true);
  });

  it('returns false when semantic structure already exists', () => {
    const parsed = createBaseParsed();
    parsed.hasStructTree = true;

    expect(isLikelyScannedPdf(parsed)).toBe(false);
  });

  it('returns false when text density indicates born-digital PDF', () => {
    const parsed = createBaseParsed();
    parsed.textItems = Array.from({ length: 120 }, (_, i) => ({
      text: `Paragraph content ${i}`,
      x: 50,
      y: 700 - i,
      width: 120,
      height: 12,
      fontName: 'Helvetica',
      fontSize: 12,
      page: (i % 3) + 1
    }));

    expect(isLikelyScannedPdf(parsed)).toBe(false);
  });
});
