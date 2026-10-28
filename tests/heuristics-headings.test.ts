import { describe, expect, it } from 'vitest';
import { createHeadingLevelNormalizer, detectHeadings, detectParagraphs } from '@/lib/remediate/heuristics';
import { extractRemediationPlan } from '@/lib/remediate/extractor';
import type { ParsedPDF, TextItem } from '@/lib/pdf/types';

function makeParsed(textItems: TextItem[], pageCount = 1): ParsedPDF {
  return { pageCount, metadata: {}, hasStructTree: false, tags: [], textItems, images: [], links: [], outlines: [], forms: [] };
}

function item(overrides: Partial<TextItem> & { text: string; y: number }): TextItem {
  return { x: 72, width: 200, height: 11, fontName: 'Arial', fontSize: 11, page: 1, ...overrides };
}

describe('heading level normalization', () => {
  it('keeps siblings as siblings when closing a level gap', () => {
    const normalize = createHeadingLevelNormalizer();
    expect([1, 3, 3, 3].map(normalize)).toEqual([1, 2, 2, 2]);
  });

  it('maps deeper and shallower levels through the stack', () => {
    const normalize = createHeadingLevelNormalizer();
    expect([1, 3, 4, 3, 2, 4, 1, 2].map(normalize)).toEqual([1, 2, 3, 2, 2, 3, 1, 2]);
  });

  it('applies the stack mapping in detectHeadings', () => {
    const parsed = makeParsed([
      item({ text: 'Document Title', fontSize: 24, bold: true, fontName: 'Arial-Bold', y: 750 }),
      item({ text: 'First Topic', fontSize: 14, bold: true, fontName: 'Arial-Bold', y: 700 }),
      item({ text: 'Body text body text body text', y: 680 }),
      item({ text: 'Second Topic', fontSize: 14, bold: true, fontName: 'Arial-Bold', y: 640 }),
      item({ text: 'More body text body text body', y: 620 }),
      item({ text: 'Third Topic', fontSize: 14, bold: true, fontName: 'Arial-Bold', y: 580 }),
      item({ text: 'Still more body text body text', y: 560 })
    ]);
    // Size ranks give 24 -> H1 and 14 -> H2 already; add a middle size that is
    // never used so 14pt would rank as H3 without normalization.
    parsed.textItems.push(item({ text: 'Sidebar Callout', fontSize: 18, bold: true, fontName: 'Arial-Bold', y: 100, page: 1 }));
    const levels = detectHeadings(parsed).map((heading) => `${heading.text}:${heading.level}`);
    expect(levels).toEqual(['Document Title:1', 'First Topic:2', 'Second Topic:2', 'Third Topic:2', 'Sidebar Callout:2']);
  });
});

describe('heading scoring', () => {
  it('does not treat an inline bold run as a heading', () => {
    const parsed = makeParsed([
      item({ text: 'Body text body text body text', y: 700 }),
      item({ text: 'Note:', bold: true, fontName: 'Arial-Bold', y: 680 }),
      item({ text: 'more body text here and there', x: 110, y: 680 }),
      item({ text: 'Body text again and again', y: 660 })
    ]);
    expect(detectHeadings(parsed)).toEqual([]);
  });

  it('accepts a short bold line of its own at body size', () => {
    const parsed = makeParsed([
      item({ text: 'Background', bold: true, fontName: 'Arial-Bold', y: 720 }),
      item({ text: 'Body text body text body text', y: 700 }),
      item({ text: 'Body text again and again', y: 686 })
    ]);
    expect(detectHeadings(parsed).map((heading) => heading.text)).toEqual(['Background']);
  });

  it('accepts numbered headings set clearly larger than body text', () => {
    const parsed = makeParsed([
      item({ text: '1. Introduction', fontSize: 18, bold: true, fontName: 'Arial-Bold', y: 700 }),
      item({ text: 'Body text body text body text', y: 680 }),
      item({ text: '1. A numbered list item', y: 660 }),
      item({ text: 'Body text again and again', y: 640 })
    ]);
    expect(detectHeadings(parsed).map((heading) => heading.text)).toEqual(['1. Introduction']);
  });
});

describe('reading order', () => {
  it('interleaves headings and paragraphs per page and does not repeat heading text as P', () => {
    const textItems: TextItem[] = [];
    for (const page of [1, 2]) {
      textItems.push(item({ page, text: `Section ${page} Title`, fontSize: 20, bold: true, fontName: 'Arial-Bold', y: 720 }));
      textItems.push(item({ page, text: `Body paragraph one on page ${page}.`, y: 690 }));
      textItems.push(item({ page, text: `Sub heading ${page}`, fontSize: 15, bold: true, fontName: 'Arial-Bold', y: 650 }));
      textItems.push(item({ page, text: `Body paragraph two on page ${page}.`, y: 620 }));
    }
    const plan = extractRemediationPlan(makeParsed(textItems, 2));
    expect(plan.readingOrder.map((entry) => `${entry.role}@${entry.page}:${entry.text}`)).toEqual([
      'H1@1:Section 1 Title',
      'P@1:Body paragraph one on page 1.',
      'H2@1:Sub heading 1',
      'P@1:Body paragraph two on page 1.',
      'H1@2:Section 2 Title',
      'P@2:Body paragraph one on page 2.',
      'H2@2:Sub heading 2',
      'P@2:Body paragraph two on page 2.'
    ]);
    expect(plan.paragraphs.some((paragraph) => /Title|Sub heading/.test(paragraph.text))).toBe(false);
  });

  it('keeps the extractor column order instead of re-sorting paragraphs by y', () => {
    // Two columns: left column lines are read before the right column even
    // where a right-column line sits higher on the page.
    const textItems: TextItem[] = [
      item({ text: 'Left column first line', x: 50, y: 700 }),
      item({ text: 'left column second line', x: 50, y: 688 }),
      item({ text: 'Left column after gap', x: 50, y: 500 }),
      item({ text: 'Right column first line', x: 330, y: 710 }),
      item({ text: 'right column second line', x: 330, y: 698 })
    ];
    const plan = extractRemediationPlan(makeParsed(textItems));
    expect(plan.readingOrder.map((entry) => entry.text)).toEqual([
      'Left column first line left column second line',
      'Left column after gap',
      'Right column first line right column second line'
    ]);
    expect(detectParagraphs(makeParsed(plan.textItems)).map((paragraph) => paragraph.text)).toEqual(
      plan.readingOrder.map((entry) => entry.text)
    );
  });
});
