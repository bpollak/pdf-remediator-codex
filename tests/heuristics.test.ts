import { describe, it, expect } from 'vitest';
import {
  detectHeadings,
  detectListItems,
  detectParagraphs,
  detectTables,
  detectArtifacts,
  detectAndReorderColumns
} from '@/lib/remediate/heuristics';
import type { ParsedPDF, TextItem } from '@/lib/pdf/types';

function makeParsed(overrides: Partial<ParsedPDF> = {}): ParsedPDF {
  return {
    pageCount: 1,
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

function makeTextItem(overrides: Partial<TextItem> = {}): TextItem {
  return {
    text: 'Sample text',
    x: 72,
    y: 700,
    width: 200,
    height: 12,
    fontName: 'Helvetica',
    fontSize: 12,
    page: 1,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// detectHeadings
// ---------------------------------------------------------------------------
describe('detectHeadings', () => {
  it('returns empty for empty documents', () => {
    const parsed = makeParsed();
    expect(detectHeadings(parsed)).toEqual([]);
  });

  it('detects bold items with larger font as headings', () => {
    const parsed = makeParsed({
      textItems: [
        makeTextItem({ text: 'Introduction', fontSize: 18, bold: true, y: 750 }),
        makeTextItem({ text: 'Body paragraph one.', fontSize: 12, bold: false, y: 700 }),
        makeTextItem({ text: 'Body paragraph two.', fontSize: 12, bold: false, y: 650 })
      ]
    });
    const headings = detectHeadings(parsed);
    expect(headings.length).toBeGreaterThan(0);
    expect(headings[0]!.text).toBe('Introduction');
    expect(headings[0]!.level).toBe(1);
  });

  it('normalizes heading levels to avoid gaps', () => {
    const parsed = makeParsed({
      textItems: [
        makeTextItem({ text: 'Title', fontSize: 24, bold: true, y: 750 }),
        makeTextItem({ text: 'Subsection', fontSize: 14, bold: true, y: 600 }),
        makeTextItem({ text: 'Body text is here for context.', fontSize: 12, y: 500 }),
        makeTextItem({ text: 'More body text is here for context.', fontSize: 12, y: 450 })
      ]
    });
    const headings = detectHeadings(parsed);
    expect(headings.length).toBe(2);
    // Levels should not skip (e.g. H1 -> H3 is invalid; should be H1 -> H2).
    expect(headings[1]!.level).toBeLessThanOrEqual(headings[0]!.level + 1);
  });

  it('rejects items that look like list items', () => {
    const parsed = makeParsed({
      textItems: [
        makeTextItem({ text: '1. First item in a list', fontSize: 18, bold: true, y: 700 }),
        makeTextItem({ text: 'Normal body text', fontSize: 12, y: 650 }),
        makeTextItem({ text: 'Normal body text again', fontSize: 12, y: 600 })
      ]
    });
    const headings = detectHeadings(parsed);
    expect(headings.every((h) => !h.text.startsWith('1.'))).toBe(true);
  });

  it('rejects very long text items as headings', () => {
    const longText = 'A'.repeat(120);
    const parsed = makeParsed({
      textItems: [
        makeTextItem({ text: longText, fontSize: 18, bold: true, y: 700 }),
        makeTextItem({ text: 'body', fontSize: 12, y: 650 }),
        makeTextItem({ text: 'body two', fontSize: 12, y: 600 })
      ]
    });
    const headings = detectHeadings(parsed);
    expect(headings.every((h) => h.text.length <= 110)).toBe(true);
  });

  it('deduplicates headings with same text/page/level', () => {
    const parsed = makeParsed({
      textItems: [
        makeTextItem({ text: 'Heading', fontSize: 18, bold: true, y: 750 }),
        makeTextItem({ text: 'Heading', fontSize: 18, bold: true, y: 750 }),
        makeTextItem({ text: 'body text', fontSize: 12, y: 600 }),
        makeTextItem({ text: 'body text two', fontSize: 12, y: 550 })
      ]
    });
    const headings = detectHeadings(parsed);
    const matchingHeadings = headings.filter((h) => h.text === 'Heading');
    expect(matchingHeadings.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// detectListItems
// ---------------------------------------------------------------------------
describe('detectListItems', () => {
  it('detects bullet list items', () => {
    const parsed = makeParsed({
      textItems: [
        makeTextItem({ text: '- First item' }),
        makeTextItem({ text: '- Second item' }),
        makeTextItem({ text: 'Not a list item' })
      ]
    });
    const items = detectListItems(parsed);
    expect(items.length).toBe(2);
  });

  it('detects numbered list items', () => {
    const parsed = makeParsed({
      textItems: [
        makeTextItem({ text: '1. First' }),
        makeTextItem({ text: '2. Second' })
      ]
    });
    expect(detectListItems(parsed).length).toBe(2);
  });

  it('rejects overly long items', () => {
    const parsed = makeParsed({
      textItems: [makeTextItem({ text: '- ' + 'A'.repeat(300) })]
    });
    expect(detectListItems(parsed).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// detectParagraphs
// ---------------------------------------------------------------------------
describe('detectParagraphs', () => {
  it('returns empty for empty documents', () => {
    expect(detectParagraphs(makeParsed()).length).toBe(0);
  });

  it('merges vertically adjacent items on the same page', () => {
    const parsed = makeParsed({
      textItems: [
        makeTextItem({ text: 'Line one', x: 72, y: 700, page: 1 }),
        makeTextItem({ text: 'continues here', x: 72, y: 688, page: 1 })
      ]
    });
    const paragraphs = detectParagraphs(parsed);
    expect(paragraphs.length).toBe(1);
    expect(paragraphs[0]!.text).toContain('Line one');
    expect(paragraphs[0]!.text).toContain('continues here');
  });

  it('splits paragraphs across pages', () => {
    const parsed = makeParsed({
      pageCount: 2,
      textItems: [
        makeTextItem({ text: 'Page one text', x: 72, y: 700, page: 1 }),
        makeTextItem({ text: 'Page two text', x: 72, y: 700, page: 2 })
      ]
    });
    const paragraphs = detectParagraphs(parsed);
    expect(paragraphs.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// detectTables
// ---------------------------------------------------------------------------
describe('detectTables', () => {
  it('returns empty when there are no aligned items', () => {
    const parsed = makeParsed({
      textItems: [makeTextItem({ text: 'lonely item' })]
    });
    expect(detectTables(parsed)).toEqual([]);
  });

  it('detects a simple 3-row 2-column table', () => {
    const items: TextItem[] = [];
    const cols = [72, 300];
    // Header row (bold)
    items.push(makeTextItem({ text: 'Name', x: cols[0], y: 700, bold: true, fontName: 'Helvetica-Bold' }));
    items.push(makeTextItem({ text: 'Score', x: cols[1], y: 700, bold: true, fontName: 'Helvetica-Bold' }));
    // Data rows
    for (let row = 1; row <= 3; row++) {
      items.push(makeTextItem({ text: `Item ${row}`, x: cols[0], y: 700 - row * 20 }));
      items.push(makeTextItem({ text: `${row * 10}`, x: cols[1], y: 700 - row * 20 }));
    }

    const parsed = makeParsed({ textItems: items });
    const tables = detectTables(parsed);
    expect(tables.length).toBe(1);
    expect(tables[0]!.rows.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects layouts with too few rows', () => {
    const parsed = makeParsed({
      textItems: [
        makeTextItem({ text: 'A', x: 72, y: 700, bold: true, fontName: 'Helvetica-Bold' }),
        makeTextItem({ text: 'B', x: 300, y: 700, bold: true, fontName: 'Helvetica-Bold' }),
        makeTextItem({ text: 'C', x: 72, y: 680 }),
        makeTextItem({ text: 'D', x: 300, y: 680 })
      ]
    });
    expect(detectTables(parsed)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// detectArtifacts
// ---------------------------------------------------------------------------
describe('detectArtifacts', () => {
  it('returns empty for documents with fewer than 3 pages', () => {
    const parsed = makeParsed({ pageCount: 2 });
    expect(detectArtifacts(parsed)).toEqual([]);
  });

  it('detects repeating header text across 3+ pages', () => {
    const items: TextItem[] = [];
    for (let page = 1; page <= 4; page++) {
      items.push(makeTextItem({ text: 'Company Name', x: 72, y: 780, page }));
      items.push(makeTextItem({ text: `Content on page ${page}`, x: 72, y: 500, page }));
    }
    const parsed = makeParsed({ pageCount: 4, textItems: items });
    const artifacts = detectArtifacts(parsed);
    expect(artifacts.some((a) => a.text === 'Company Name')).toBe(true);
  });

  it('detects page numbers in margins', () => {
    const items: TextItem[] = [];
    for (let page = 1; page <= 3; page++) {
      items.push(makeTextItem({ text: String(page), x: 300, y: 30, page }));
    }
    const parsed = makeParsed({ pageCount: 3, textItems: items });
    const artifacts = detectArtifacts(parsed);
    expect(artifacts.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// detectAndReorderColumns
// ---------------------------------------------------------------------------
describe('detectAndReorderColumns', () => {
  it('returns items unchanged for single-column layout', () => {
    const items = [
      makeTextItem({ text: 'A', x: 72, y: 700 }),
      makeTextItem({ text: 'B', x: 72, y: 680 })
    ];
    const result = detectAndReorderColumns(items, 612);
    expect(result.length).toBe(2);
  });

  it('reorders two-column layouts left-then-right', () => {
    const items = [
      makeTextItem({ text: 'Left1', x: 72, y: 700 }),
      makeTextItem({ text: 'Right1', x: 350, y: 700 }),
      makeTextItem({ text: 'Left2', x: 72, y: 680 }),
      makeTextItem({ text: 'Right2', x: 350, y: 680 })
    ];
    const result = detectAndReorderColumns(items, 612);
    // Left column items should come before right column items.
    const leftIdx = result.findIndex((i) => i.text === 'Left1');
    const rightIdx = result.findIndex((i) => i.text === 'Right1');
    expect(leftIdx).toBeLessThan(rightIdx);
  });

  it('returns items unchanged when fewer than 4', () => {
    const items = [makeTextItem({ text: 'A', x: 72, y: 700 })];
    expect(detectAndReorderColumns(items, 612)).toEqual(items);
  });
});
