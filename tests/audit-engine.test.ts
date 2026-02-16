import { describe, expect, it } from 'vitest';
import { runAudit } from '@/lib/audit/engine';
import type { ParsedPDF } from '@/lib/pdf/types';

function createBase(): ParsedPDF {
  return {
    pageCount: 5,
    metadata: {},
    hasStructTree: false,
    tags: [],
    textItems: [{ text: '- item one', x: 10, y: 700, width: 100, height: 12, fontName: 'Helvetica', fontSize: 12, page: 1 }],
    images: [{ id: 'img-1', page: 1, x: 50, y: 500, width: 200, height: 200 }],
    links: [{ text: 'click here', url: 'https://example.com', page: 1 }],
    outlines: [],
    forms: [{ name: 'email', required: true }]
  };
}

describe('runAudit', () => {
  it('returns findings for untagged PDFs with missing metadata', () => {
    const result = runAudit(createBase());
    expect(result.findings.some((f) => f.ruleId === 'DOC-002')).toBe(true);
    expect(result.findings.some((f) => f.ruleId === 'IMG-001')).toBe(true);
    expect(result.score).toBeLessThan(100);
  });

  it('assigns a low score to scanned/image-only documents', () => {
    const scanned: ParsedPDF = {
      pageCount: 6,
      metadata: {},
      hasStructTree: false,
      tags: [],
      textItems: [],
      images: [],
      links: [],
      outlines: [],
      forms: []
    };

    const result = runAudit(scanned);
    expect(result.findings.some((f) => f.ruleId === 'DOC-004')).toBe(true);
    expect(result.score).toBeLessThanOrEqual(20);
  });

  it('returns improved score for accessible-like document', () => {
    const parsed = createBase();
    parsed.hasStructTree = true;
    parsed.language = 'en-US';
    parsed.metadata = { 'pdfuaid:part': '1', Subject: 'Demo' };
    parsed.images = [{ ...parsed.images[0], alt: 'Team meeting overview' }];
    parsed.links = [{ text: 'Download annual report PDF', url: 'https://example.com', page: 1 }];
    parsed.outlines = [{ title: 'Section 1', page: 1 }];
    parsed.forms = [{ name: 'email', label: 'Email', required: true }];

    const result = runAudit(parsed);
    expect(result.score).toBeGreaterThan(70);
  });
});
