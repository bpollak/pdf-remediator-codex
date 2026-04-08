import { describe, expect, it } from 'vitest';
import { extractRemediationPlan } from '@/lib/remediate/extractor';
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

describe('extractRemediationPlan', () => {
  it('returns all plan fields for an empty document', () => {
    const plan = extractRemediationPlan(makeParsed());
    expect(plan.headings).toEqual([]);
    expect(plan.listItems).toEqual([]);
    expect(plan.paragraphs).toEqual([]);
    expect(plan.tables).toEqual([]);
    expect(plan.artifacts).toEqual([]);
    expect(plan.textItems).toEqual([]);
    expect(plan.pageCount).toBe(1);
  });

  it('preserves metadata, title, language from parsed input', () => {
    const plan = extractRemediationPlan(makeParsed({
      metadata: { Title: 'Test' },
      title: 'Test',
      language: 'en-US'
    }));
    expect(plan.title).toBe('Test');
    expect(plan.language).toBe('en-US');
    expect(plan.metadata.Title).toBe('Test');
  });

  it('passes images, links, outlines, forms through unchanged', () => {
    const parsed = makeParsed({
      images: [{ id: 'img-1', page: 1, x: 0, y: 0, width: 100, height: 100 }],
      links: [{ text: 'Home', url: 'https://example.com', page: 1 }],
      outlines: [{ title: 'Intro', page: 1 }],
      forms: [{ name: 'field-1', label: 'Name' }]
    });
    const plan = extractRemediationPlan(parsed);
    expect(plan.images.length).toBe(1);
    expect(plan.links.length).toBe(1);
    expect(plan.outlines.length).toBe(1);
    expect(plan.forms.length).toBe(1);
  });

  it('detects headings from bold large text', () => {
    const parsed = makeParsed({
      textItems: [
        makeTextItem({ text: 'Chapter One', fontSize: 20, bold: true, y: 750 }),
        makeTextItem({ text: 'Normal body text content here.', fontSize: 12, y: 700 }),
        makeTextItem({ text: 'More body text content.', fontSize: 12, y: 680 })
      ]
    });
    const plan = extractRemediationPlan(parsed);
    expect(plan.headings.length).toBeGreaterThan(0);
    expect(plan.headings[0]!.text).toBe('Chapter One');
  });

  it('detects list items from bullet patterns', () => {
    const parsed = makeParsed({
      textItems: [
        makeTextItem({ text: '- First item in list' }),
        makeTextItem({ text: '- Second item in list' })
      ]
    });
    const plan = extractRemediationPlan(parsed);
    expect(plan.listItems.length).toBe(2);
  });

  it('reorders multi-column text items by column', () => {
    const parsed = makeParsed({
      textItems: [
        makeTextItem({ text: 'Left1', x: 72, y: 700 }),
        makeTextItem({ text: 'Right1', x: 400, y: 700 }),
        makeTextItem({ text: 'Left2', x: 72, y: 680 }),
        makeTextItem({ text: 'Right2', x: 400, y: 680 })
      ]
    });
    const plan = extractRemediationPlan(parsed);
    // Left column items should appear before right column
    const leftIdx = plan.textItems.findIndex((i) => i.text === 'Left1');
    const rightIdx = plan.textItems.findIndex((i) => i.text === 'Right1');
    expect(leftIdx).toBeLessThan(rightIdx);
  });
});
