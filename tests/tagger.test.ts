import { describe, expect, it } from 'vitest';
import { buildTagTree, type TagNode } from '@/lib/remediate/tagger';
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

function flattenTypes(node: TagNode): string[] {
  const types: string[] = [node.type];
  for (const child of node.children ?? []) {
    types.push(...flattenTypes(child));
  }
  return types;
}

describe('buildTagTree', () => {
  it('returns a Document root with no children for empty input', () => {
    const plan = extractRemediationPlan(makeParsed());
    const tree = buildTagTree(plan);
    expect(tree.type).toBe('Document');
    expect(tree.children).toEqual([]);
  });

  it('creates heading nodes from detected headings', () => {
    const parsed = makeParsed({
      textItems: [
        makeTextItem({ text: 'Title', fontSize: 24, bold: true, y: 750 }),
        makeTextItem({ text: 'body body body body.', fontSize: 12, y: 700 }),
        makeTextItem({ text: 'more body text here.', fontSize: 12, y: 680 })
      ]
    });
    const tree = buildTagTree(extractRemediationPlan(parsed));
    const types = flattenTypes(tree);
    expect(types).toContain('H1');
  });

  it('wraps list items in L > LI > Lbl + LBody structure', () => {
    const parsed = makeParsed({
      textItems: [
        makeTextItem({ text: '- First', y: 700 }),
        makeTextItem({ text: '- Second', y: 680 })
      ]
    });
    const tree = buildTagTree(extractRemediationPlan(parsed));
    const types = flattenTypes(tree);
    expect(types).toContain('L');
    expect(types).toContain('LI');
    expect(types).toContain('Lbl');
    expect(types).toContain('LBody');
  });

  it('creates Table > TR > TH/TD structure from detected tables', () => {
    const items: TextItem[] = [];
    const cols = [72, 300];
    items.push(makeTextItem({ text: 'Name', x: cols[0], y: 700, bold: true, fontName: 'Helvetica-Bold' }));
    items.push(makeTextItem({ text: 'Value', x: cols[1], y: 700, bold: true, fontName: 'Helvetica-Bold' }));
    for (let row = 1; row <= 3; row++) {
      items.push(makeTextItem({ text: `Item ${row}`, x: cols[0], y: 700 - row * 20 }));
      items.push(makeTextItem({ text: `${row}`, x: cols[1], y: 700 - row * 20 }));
    }

    const tree = buildTagTree(extractRemediationPlan(makeParsed({ textItems: items })));
    const types = flattenTypes(tree);
    expect(types).toContain('Table');
    expect(types).toContain('TR');
    // Either TH or TD should be present
    expect(types.some((t) => t === 'TH' || t === 'TD')).toBe(true);
  });

  it('nests headings into Sect elements', () => {
    const parsed = makeParsed({
      textItems: [
        makeTextItem({ text: 'Chapter', fontSize: 24, bold: true, y: 750 }),
        makeTextItem({ text: 'Section', fontSize: 18, bold: true, y: 700 }),
        makeTextItem({ text: 'body text content here.', fontSize: 12, y: 650 }),
        makeTextItem({ text: 'more body text content.', fontSize: 12, y: 630 })
      ]
    });
    const tree = buildTagTree(extractRemediationPlan(parsed));
    const types = flattenTypes(tree);
    expect(types).toContain('Sect');
  });

  it('creates P nodes from paragraphs', () => {
    const parsed = makeParsed({
      textItems: [
        makeTextItem({ text: 'A normal paragraph of text here.', fontSize: 12, y: 700 })
      ]
    });
    const tree = buildTagTree(extractRemediationPlan(parsed));
    const types = flattenTypes(tree);
    expect(types).toContain('P');
  });
});
