import { describe, expect, it } from 'vitest';
import type { ParsedPDF } from '@/lib/pdf/types';
import { classifyPdfSource } from '@/lib/pdf/source-type';

function makeParsed(overrides: Partial<ParsedPDF> = {}): ParsedPDF {
  return {
    pageCount: 6,
    metadata: {},
    hasStructTree: false,
    tags: [],
    textItems: [],
    images: [],
    links: [],
    outlines: [],
    forms: [],
    ...overrides
  };
}

describe('classifyPdfSource', () => {
  it('classifies checker report artifacts with high confidence', () => {
    const parsed = makeParsed({
      pageCount: 2,
      textItems: [],
      images: [
        { id: 'img-1', page: 1, x: 0, y: 0, width: 200, height: 100 },
        { id: 'img-2', page: 2, x: 0, y: 0, width: 200, height: 100 }
      ]
    });

    const result = classifyPdfSource('Acrobat - Report - sample.pdf', parsed);
    expect(result.type).toBe('checker-report-artifact');
    expect(result.confidence).toBe('high');
  });

  it('classifies rich content documents as source PDFs', () => {
    const textItems = Array.from({ length: 500 }, (_, index) => ({
      text: `Paragraph ${index}`,
      x: 72,
      y: 700 - (index % 40),
      width: 120,
      height: 12,
      fontName: 'Helvetica',
      fontSize: 12,
      page: (index % 8) + 1
    }));
    const parsed = makeParsed({
      pageCount: 8,
      textItems,
      outlines: [{ title: 'Introduction', page: 1 }]
    });

    const result = classifyPdfSource('course-handout.pdf', parsed);
    expect(result.type).toBe('content-document');
    expect(['high', 'medium']).toContain(result.confidence);
  });

  it('returns mixed-or-uncertain for ambiguous files', () => {
    const parsed = makeParsed({
      pageCount: 3,
      textItems: Array.from({ length: 8 }, (_, index) => ({
        text: `Text ${index}`,
        x: 72,
        y: 700 - index * 10,
        width: 80,
        height: 10,
        fontName: 'Helvetica',
        fontSize: 10,
        page: 1
      })),
      images: [{ id: 'img-1', page: 1, x: 10, y: 10, width: 50, height: 50 }]
    });

    const result = classifyPdfSource('export.pdf', parsed);
    expect(result.type).toBe('mixed-or-uncertain');
  });
});
