import { describe, expect, it } from 'vitest';
import { assessOcrTextGain, isLikelyScannedPdf, summarizePdfTextSignal } from '@/lib/ocr/detection';
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

  it('returns false for low-density but coherent born-digital text', () => {
    const parsed = createBaseParsed();
    parsed.textItems = [
      { text: 'Meeting Minutes', x: 30, y: 700, width: 100, height: 12, fontName: 'Helvetica', fontSize: 12, page: 1 },
      { text: 'Budget Overview', x: 30, y: 680, width: 100, height: 12, fontName: 'Helvetica', fontSize: 12, page: 1 },
      { text: 'Action Items', x: 30, y: 660, width: 100, height: 12, fontName: 'Helvetica', fontSize: 12, page: 2 },
      { text: 'Follow-up Schedule', x: 30, y: 640, width: 100, height: 12, fontName: 'Helvetica', fontSize: 12, page: 2 },
      { text: 'Stakeholder Review', x: 30, y: 620, width: 100, height: 12, fontName: 'Helvetica', fontSize: 12, page: 3 },
      { text: 'Final Approval', x: 30, y: 600, width: 100, height: 12, fontName: 'Helvetica', fontSize: 12, page: 3 }
    ];

    expect(isLikelyScannedPdf(parsed)).toBe(false);
  });

  it('returns true for sparse short-token extraction typical of scanned artifacts', () => {
    const parsed = createBaseParsed();
    parsed.pageCount = 7;
    parsed.textItems = [
      { text: 'Sample', x: 40, y: 700, width: 40, height: 10, fontName: 'Helvetica', fontSize: 10, page: 1 },
      { text: 'Scanned', x: 90, y: 700, width: 50, height: 10, fontName: 'Helvetica', fontSize: 10, page: 1 },
      { text: 'Copy', x: 150, y: 700, width: 30, height: 10, fontName: 'Helvetica', fontSize: 10, page: 1 },
      { text: 'Academic', x: 40, y: 680, width: 55, height: 10, fontName: 'Helvetica', fontSize: 10, page: 2 },
      { text: 'Year', x: 100, y: 680, width: 25, height: 10, fontName: 'Helvetica', fontSize: 10, page: 2 },
      { text: '2014', x: 130, y: 680, width: 30, height: 10, fontName: 'Helvetica', fontSize: 10, page: 2 },
      { text: 'Academic', x: 40, y: 660, width: 55, height: 10, fontName: 'Helvetica', fontSize: 10, page: 3 },
      { text: 'Year', x: 100, y: 660, width: 25, height: 10, fontName: 'Helvetica', fontSize: 10, page: 3 },
      { text: '2015', x: 130, y: 660, width: 30, height: 10, fontName: 'Helvetica', fontSize: 10, page: 3 },
      { text: 'Academic', x: 40, y: 640, width: 55, height: 10, fontName: 'Helvetica', fontSize: 10, page: 4 }
    ];

    expect(isLikelyScannedPdf(parsed)).toBe(true);
  });
});

describe('summarizePdfTextSignal', () => {
  it('captures text density metrics used by OCR heuristics', () => {
    const parsed = createBaseParsed();
    parsed.pageCount = 2;
    parsed.textItems = [
      { text: 'Budget review', x: 30, y: 700, width: 80, height: 12, fontName: 'Helvetica', fontSize: 12, page: 1 },
      { text: 'March 2026', x: 30, y: 680, width: 70, height: 12, fontName: 'Helvetica', fontSize: 12, page: 2 }
    ];

    const summary = summarizePdfTextSignal(parsed);

    expect(summary.totalTextItems).toBe(2);
    expect(summary.totalNonWhitespaceChars).toBe('BudgetreviewMarch2026'.length);
    expect(summary.textItemsPerPage).toBe(1);
    expect(summary.nonWhitespaceCharsPerPage).toBe('BudgetreviewMarch2026'.length / 2);
  });
});

describe('assessOcrTextGain', () => {
  it('accepts OCR output that adds strong searchable-text growth', () => {
    const original = createBaseParsed();
    original.pageCount = 2;
    original.textItems = [
      { text: 'A', x: 10, y: 700, width: 10, height: 10, fontName: 'Helvetica', fontSize: 10, page: 1 }
    ];

    const candidate = createBaseParsed();
    candidate.pageCount = 2;
    candidate.textItems = [
      { text: 'Application for academic accommodation', x: 30, y: 700, width: 240, height: 12, fontName: 'OCR', fontSize: 12, page: 1 },
      { text: 'Student ID and department details', x: 30, y: 680, width: 220, height: 12, fontName: 'OCR', fontSize: 12, page: 1 },
      { text: 'Supporting documentation is attached', x: 30, y: 700, width: 230, height: 12, fontName: 'OCR', fontSize: 12, page: 2 },
      { text: 'Advisor signature and approval date', x: 30, y: 680, width: 220, height: 12, fontName: 'OCR', fontSize: 12, page: 2 }
    ];

    const assessment = assessOcrTextGain(original, candidate);

    expect(assessment.accepted).toBe(true);
    expect(assessment.reason).toBeUndefined();
  });

  it('rejects OCR output that does not improve searchable text', () => {
    const original = createBaseParsed();
    original.pageCount = 2;
    original.textItems = [
      { text: 'A', x: 10, y: 700, width: 10, height: 10, fontName: 'Helvetica', fontSize: 10, page: 1 }
    ];

    const candidate = createBaseParsed();
    candidate.pageCount = 2;
    candidate.textItems = [
      { text: 'A', x: 10, y: 700, width: 10, height: 10, fontName: 'Helvetica', fontSize: 10, page: 1 }
    ];

    const assessment = assessOcrTextGain(original, candidate);

    expect(assessment.accepted).toBe(false);
    expect(assessment.reason).toMatch(/did not add enough searchable text/i);
  });

  it('rejects OCR output that still exposes no text', () => {
    const original = createBaseParsed();
    const candidate = createBaseParsed();

    const assessment = assessOcrTextGain(original, candidate);

    expect(assessment.accepted).toBe(false);
    expect(assessment.reason).toBe('OCR output did not expose any searchable text');
  });
});
