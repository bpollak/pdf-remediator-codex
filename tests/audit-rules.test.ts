import { describe, expect, it } from 'vitest';
import { allRules } from '@/lib/audit/rules';
import type { ParsedPDF } from '@/lib/pdf/types';

/* ------------------------------------------------------------------ */
/* Fixtures                                                           */
/* ------------------------------------------------------------------ */

/** Fully accessible: passes every active rule. */
function accessibleParsed(): ParsedPDF {
  return {
    pageCount: 5,
    metadata: { 'pdfuaid:part': '1', Subject: 'Accessible document' },
    language: 'en-US',
    title: 'Accessible Document',
    hasStructTree: true,
    tags: [
      { type: 'Document', page: 1 },
      { type: 'H1', page: 1, text: 'Introduction' },
      { type: 'H2', page: 2, text: 'Background' },
      { type: 'H3', page: 2, text: 'Details' },
      { type: 'P', page: 1, text: 'Body paragraph text.' },
      { type: 'L', page: 1 },
      { type: 'LI', page: 1 },
      { type: 'Table', page: 3 },
      { type: 'TR', page: 3 },
      { type: 'TH', page: 3, text: 'Name' },
      { type: 'TD', page: 3, text: 'Value' }
    ],
    textItems: [
      { text: 'Introduction', x: 10, y: 750, width: 200, height: 24, fontName: 'Helvetica-Bold', fontSize: 24, bold: true, page: 1 },
      { text: 'This is a normal paragraph.', x: 10, y: 700, width: 400, height: 12, fontName: 'Helvetica', fontSize: 12, page: 1 },
      { text: 'Another line of text here.', x: 10, y: 680, width: 400, height: 12, fontName: 'Helvetica', fontSize: 12, page: 1 },
      { text: '- item one', x: 10, y: 660, width: 100, height: 12, fontName: 'Helvetica', fontSize: 12, page: 1 },
      { text: '- item two', x: 10, y: 640, width: 100, height: 12, fontName: 'Helvetica', fontSize: 12, page: 1 }
    ],
    images: [{ id: 'img-1', page: 1, x: 50, y: 500, width: 200, height: 200, alt: 'Team meeting overview' }],
    links: [{ text: 'Download annual report', url: 'https://example.com/report', page: 1 }],
    outlines: [{ title: 'Introduction', page: 1 }, { title: 'Background', page: 2 }],
    forms: [{ name: 'email', label: 'Email Address', required: true }]
  };
}

/**
 * Untagged PDF: no structure, no metadata, no language.
 * Triggers: DOC-001, DOC-002, DOC-003, HDG-002, LST-001, LNK-002,
 *           FRM-001, FRM-002, META-001, META-002, IMG-001
 */
function untaggedParsed(): ParsedPDF {
  return {
    pageCount: 5,
    metadata: {},
    hasStructTree: false,
    tags: [],
    textItems: [
      { text: '- item one', x: 10, y: 700, width: 100, height: 12, fontName: 'Helvetica', fontSize: 12, page: 1 },
      { text: '- item two', x: 10, y: 680, width: 100, height: 12, fontName: 'Helvetica', fontSize: 12, page: 1 },
      { text: '- item three', x: 10, y: 660, width: 100, height: 12, fontName: 'Helvetica', fontSize: 12, page: 1 },
      { text: 'Some paragraph text here for density.', x: 10, y: 600, width: 400, height: 12, fontName: 'Helvetica', fontSize: 12, page: 1 },
      { text: 'Another paragraph with sufficient text.', x: 10, y: 580, width: 400, height: 12, fontName: 'Helvetica', fontSize: 12, page: 2 },
      ...Array.from({ length: 80 }, (_, i) => ({
        text: `Line ${i} of filler text content for pages.`,
        x: 10, y: 750 - (i % 20) * 30, width: 400, height: 12,
        fontName: 'Helvetica', fontSize: 12, page: Math.floor(i / 20) + 1
      }))
    ],
    images: [{ id: 'img-1', page: 1, x: 50, y: 500, width: 200, height: 200 }],
    links: [{ text: 'click here', url: 'https://example.com', page: 1 }],
    outlines: [],
    forms: [{ name: 'email', required: true }]
  };
}

/**
 * Partially accessible PDF: has structure but specific violations.
 * Triggers: HDG-001, IMG-002, LNK-001, TBL-001
 */
function partialParsed(): ParsedPDF {
  return {
    pageCount: 3,
    metadata: { 'pdfuaid:part': '1', Subject: 'Partial document' },
    language: 'en-US',
    title: 'Partial Document',
    hasStructTree: true,
    tags: [
      { type: 'Document', page: 1 },
      { type: 'H1', page: 1, text: 'Title' },
      { type: 'H3', page: 2, text: 'Subsection' }, // skips H2 → triggers HDG-001
      { type: 'L', page: 1 },
      { type: 'Table', page: 2 }
      // no TR tag → triggers TBL-001
    ],
    textItems: [
      { text: 'Title', x: 10, y: 750, width: 200, height: 24, fontName: 'Helvetica-Bold', fontSize: 24, bold: true, page: 1 },
      { text: 'Body text content.', x: 10, y: 700, width: 400, height: 12, fontName: 'Helvetica', fontSize: 12, page: 1 },
      ...Array.from({ length: 40 }, (_, i) => ({
        text: `Content line ${i} for text density.`,
        x: 10, y: 700 - (i % 20) * 30, width: 400, height: 12,
        fontName: 'Helvetica', fontSize: 12, page: Math.floor(i / 20) + 1
      }))
    ],
    images: [{ id: 'img-1', page: 1, x: 50, y: 500, width: 200, height: 200, alt: 'IMG_2034.jpg' }],
    links: [
      { text: 'click here', url: 'https://example.com', page: 1 },
      { text: 'Read the documentation', url: 'https://docs.example.com', page: 2 }
    ],
    outlines: [{ title: 'Title', page: 1 }],
    forms: [{ name: 'email', label: 'Email', required: true }]
  };
}

/**
 * Structured but unbound PDF: has StructTreeRoot-like signals without
 * marked-content bindings. Triggers DOC-005.
 */
function unboundStructuredParsed(): ParsedPDF {
  const parsed = partialParsed();
  parsed.structureBinding = {
    structElemCount: 120,
    structElemWithPageRef: 120,
    structElemWithMcid: 0,
    structElemWithNumericK: 0,
    structElemWithMcr: 0,
    hasParentTree: false,
    hasParentTreeEntries: false,
    tableStructCount: 4,
    rowStructCount: 20,
    headerCellStructCount: 6,
    dataCellStructCount: 40,
    hasContentBinding: false
  };
  return parsed;
}

/* ------------------------------------------------------------------ */
/* Fixture → rule ID mapping (which fixture should trigger the rule)  */
/* ------------------------------------------------------------------ */

const failingFixtureByRuleId: Record<string, 'untagged' | 'partial' | 'unbound'> = {
  'DOC-001': 'untagged',
  'DOC-002': 'untagged',
  'DOC-003': 'untagged',
  'DOC-005': 'unbound',
  'HDG-001': 'partial',
  'HDG-002': 'untagged',
  'IMG-001': 'untagged',
  'IMG-002': 'partial',
  'TBL-001': 'partial',
  'LST-001': 'untagged',
  'LNK-001': 'partial',
  'LNK-002': 'untagged',
  'FRM-001': 'untagged',
  'FRM-002': 'untagged',
  'META-001': 'untagged',
  'META-002': 'untagged'
};

function fixture(name: 'untagged' | 'partial' | 'unbound'): ParsedPDF {
  if (name === 'untagged') return untaggedParsed();
  if (name === 'unbound') return unboundStructuredParsed();
  return partialParsed();
}

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe('audit rules', () => {
  it('all rules pass on accessible fixture', () => {
    const parsed = accessibleParsed();
    for (const rule of allRules) {
      const findings = rule.evaluate({ parsed: structuredClone(parsed) });
      expect(findings.length, `Expected ${rule.id} to pass`).toBe(0);
    }
  });

  // Test each active rule (skip CLR-001/CLR-002 which are placeholders)
  const activeRules = allRules.filter((r) => r.id in failingFixtureByRuleId);

  for (const rule of activeRules) {
    it(`${rule.id} reports findings on failing fixture`, () => {
      const parsed = structuredClone(fixture(failingFixtureByRuleId[rule.id]!));
      const findings = rule.evaluate({ parsed });
      expect(findings.length, `${rule.id} should report at least one finding`).toBeGreaterThan(0);
      for (const finding of findings) {
        expect(finding.ruleId).toBe(rule.id);
      }
    });
  }

  it('CLR-001 detects low-contrast text when color data is present', () => {
    const parsed = accessibleParsed();
    parsed.textItems.push({
      text: 'Light gray text', x: 10, y: 400, width: 200, height: 12,
      fontName: 'Helvetica', fontSize: 12, page: 1, color: 'rgb(200, 200, 200)'
    });
    const clr001 = allRules.find((r) => r.id === 'CLR-001')!;
    const findings = clr001.evaluate({ parsed });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].ruleId).toBe('CLR-001');
  });

  it('CLR-001 passes when text has sufficient contrast', () => {
    const parsed = accessibleParsed();
    parsed.textItems.push({
      text: 'Dark text', x: 10, y: 400, width: 200, height: 12,
      fontName: 'Helvetica', fontSize: 12, page: 1, color: 'rgb(0, 0, 0)'
    });
    const clr001 = allRules.find((r) => r.id === 'CLR-001')!;
    expect(clr001.evaluate({ parsed })).toEqual([]);
  });

  it('CLR-002 is placeholder (returns no findings)', () => {
    const parsed = accessibleParsed();
    const clr002 = allRules.find((r) => r.id === 'CLR-002')!;
    expect(clr002.evaluate({ parsed })).toEqual([]);
  });
});
