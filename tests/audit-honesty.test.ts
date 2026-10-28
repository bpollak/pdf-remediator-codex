import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFString, StandardFonts } from 'pdf-lib';
import { allRules } from '@/lib/audit/rules';
import { runAudit } from '@/lib/audit/engine';
import { isLikelyScannedPdf } from '@/lib/ocr/detection';
import { parsePdfBytes } from '@/lib/pdf/parser';
import { buildRemediatedPdf } from '@/lib/remediate/builder';
import { computeDisplayedAutomatedScore } from '@/lib/report/display-score';
import { ANALYSIS_ONLY_SCORE_CAP } from '@/lib/utils/scoring';
import { getVerapdfComplianceVerdict, getVerapdfUnavailableReason } from '@/lib/verapdf/result';
import type { ParsedPDF } from '@/lib/pdf/types';

function ab(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function base(overrides: Partial<ParsedPDF> = {}): ParsedPDF {
  return {
    pageCount: 1,
    metadata: { 'pdfuaid:part': '1' },
    language: 'en-US',
    title: 'Campus Parking Policy',
    hasStructTree: true,
    tags: [{ type: 'Document', page: 1 }, { type: 'P', page: 1 }],
    textItems: [
      { text: 'Parking permits are issued each quarter.', x: 72, y: 700, width: 300, height: 12, fontName: 'Helvetica', fontSize: 12, page: 1 }
    ],
    images: [],
    links: [],
    outlines: [],
    forms: [],
    ...overrides
  };
}

function ruleIds(parsed: ParsedPDF): string[] {
  return runAudit(parsed).findings.map((finding) => finding.ruleId);
}

function rule(id: string) {
  return allRules.find((candidate) => candidate.id === id)!;
}

describe('document title rule (WCAG 2.4.2)', () => {
  it.each([
    [undefined, /missing/],
    ['', /missing/],
    ['Untitled', /placeholder/],
    ['Untitled-3', /placeholder/],
    ['Microsoft Word - Budget FY26.docx', /placeholder/],
    ['Document1', /placeholder/],
    ['Accessible remediated PDF', /placeholder/],
    ['Budget FY26.docx', /file name/],
    ['slides_final_v2.pptx', /file name/],
    ['report.pdf', /file name/],
    ['final_report_v2', /file name/]
  ])('fails for %j', (title, description) => {
    const findings = rule('META-003').evaluate({ parsed: base({ title }) });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.wcagCriterion).toBe('2.4.2 Page Titled');
    expect(findings[0]!.description).toMatch(description);
  });

  it.each(['Campus Parking Policy', 'COVID-19 Guidance for Staff', 'Fall 2026 Course Schedule', 'Microsoft Word Tips for Faculty'])('passes for %j', (title) => {
    expect(rule('META-003').evaluate({ parsed: base({ title }) })).toEqual([]);
  });

  it('no longer scores missing Subject metadata (not a WCAG requirement)', () => {
    expect(allRules.some((candidate) => candidate.id === 'META-001')).toBe(false);
    expect(runAudit(base({ metadata: { 'pdfuaid:part': '1' } })).score).toBe(100);
  });
});

describe('scanned detection (DOC-004)', () => {
  const fullPageScan = (page: number) => ({ id: `img-${page}-1`, page, x: 0, y: 0, width: 612, height: 792 });
  const pageBoxes = [{ x: 0, y: 0, width: 612, height: 792 }, { x: 0, y: 0, width: 612, height: 792 }];

  it('still flags image-only pages when a structure tree exists', () => {
    const parsed = base({ pageCount: 2, pageBoxes, textItems: [], images: [fullPageScan(1), fullPageScan(2)] });
    expect(isLikelyScannedPdf(parsed)).toBe(true);
    expect(ruleIds(parsed)).toContain('DOC-004');
  });

  it('counts OCR text as text', () => {
    const ocrLine = (page: number, line: number) => ({
      text: `Recognized line ${line} of the scanned memo on page ${page}.`,
      x: 72, y: 700 - line * 14, width: 400, height: 12, fontName: 'OCR', fontSize: 12, page
    });
    const textItems = [1, 2].flatMap((page) => [0, 1, 2, 3].map((line) => ocrLine(page, line)));
    const parsed = base({ pageCount: 2, pageBoxes, textItems, images: [fullPageScan(1), fullPageScan(2)] });
    expect(isLikelyScannedPdf(parsed)).toBe(false);
  });

  it('does not flag a born-digital page with a small logo', () => {
    const parsed = base({ pageBoxes: pageBoxes.slice(0, 1), images: [{ id: 'img-1-1', page: 1, x: 72, y: 720, width: 60, height: 40 }] });
    expect(isLikelyScannedPdf(parsed)).toBe(false);
  });
});

describe('scores for files that are not fixed', () => {
  it(`caps analysis-only output at ${ANALYSIS_ONLY_SCORE_CAP}`, () => {
    const parsed = base({ remediationMode: 'analysis-only' });
    expect(runAudit(parsed).findings).toEqual([]);
    expect(runAudit(parsed).score).toBe(ANALYSIS_ONLY_SCORE_CAP);
    expect(runAudit(base({ remediationMode: 'content-bound' })).score).toBe(100);
  });

  it('caps a stored analysis-only score on display', () => {
    const auditResult = { score: 92, findings: [] };
    expect(computeDisplayedAutomatedScore({ auditResult, variant: 'remediated', remediationMode: 'analysis-only' })).toBe(40);
    expect(computeDisplayedAutomatedScore({ auditResult, variant: 'remediated', remediationMode: 'content-bound' })).toBe(92);
  });

  it('charges 50 images without alt text more than one', () => {
    const images = Array.from({ length: 50 }, (_, index) => ({ id: `img-1-${index + 1}`, page: 1, x: 0, y: 0, width: 10, height: 10 }));
    expect(runAudit(base({ images })).score).toBe(55);
  });
});

describe('audit false passes', () => {
  it('DOC-005 fails an empty structure tree', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage().drawText('Quarterly budget report for the department', { x: 72, y: 700, size: 12, font });
    doc.catalog.set(PDFName.of('StructTreeRoot'), doc.context.register(doc.context.obj({ Type: 'StructTreeRoot' })));
    doc.catalog.set(PDFName.of('MarkInfo'), doc.context.obj({ Marked: true }));
    doc.catalog.set(PDFName.of('Lang'), PDFString.of('en-US'));
    doc.setTitle('Budget');
    const parsed = await parsePdfBytes(ab(await doc.save()));

    const doc005 = runAudit(parsed).findings.find((finding) => finding.ruleId === 'DOC-005');
    expect(doc005?.description).toMatch(/empty/i);
    expect(runAudit(parsed).score).toBeLessThanOrEqual(35);
  });

  it('DOC-007 fails when most visible text is outside the tag tree (opt-in invisible copy)', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    for (let line = 0; line < 8; line += 1) {
      page.drawText(`Line ${line} of the committee meeting minutes text`, { x: 72, y: 700 - line * 16, size: 11, font });
    }
    const source = await doc.save();
    const parsed = await parsePdfBytes(ab(source));
    const out = await buildRemediatedPdf(parsed, 'en-US', ab(source), { injectBoundTextLayer: true });
    const reparsed = await parsePdfBytes(ab(out));

    const coverage = reparsed.textTagCoverage!;
    expect(coverage.taggedChars).toBeGreaterThan(0);
    expect(coverage.untaggedChars).toBeGreaterThan(0);
    const doc007 = runAudit(reparsed).findings.find((finding) => finding.ruleId === 'DOC-007');
    expect(doc007).toBeDefined();
    expect(doc007!.description).toMatch(/% of the page text/);
  });

  it('DOC-007 passes when the page text is fully tagged', () => {
    const parsed = base({
      structureBinding: {
        structElemCount: 2, structElemWithPageRef: 1, structElemWithMcid: 0, structElemWithNumericK: 1, structElemWithMcr: 0,
        hasParentTree: true, hasParentTreeEntries: true, tableStructCount: 0, rowStructCount: 0, headerCellStructCount: 0,
        dataCellStructCount: 0, hasContentBinding: true
      },
      textTagCoverage: { taggedChars: 500, untaggedChars: 10 }
    });
    expect(ruleIds(parsed)).not.toContain('DOC-007');
    const low = { ...parsed, textTagCoverage: { taggedChars: 100, untaggedChars: 400 } };
    expect(runAudit(low).findings.find((finding) => finding.ruleId === 'DOC-007')?.severity).toBe('critical');
    expect(runAudit(low).score).toBeLessThanOrEqual(40);
  });

  it('CLR-002 is reported as not checked instead of passing', () => {
    expect(runAudit(base()).notChecked).toContain('CLR-002');
  });

  it('TBL-001 flags tables with data cells but no header cells', () => {
    const tags = [{ type: 'Table', page: 1 }, { type: 'TR', page: 1 }, { type: 'TD', page: 1 }, { type: 'TD', page: 1 }];
    const findings = rule('TBL-001').evaluate({ parsed: base({ tags }) });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.description).toMatch(/header/i);
    expect(rule('TBL-001').evaluate({ parsed: base({ tags: [...tags, { type: 'TH', page: 1 }] }) })).toEqual([]);
  });

  it('LST-001 does not pass on one list tag when list-like text elsewhere is untagged', () => {
    const listLine = (text: string, page: number, y: number) => ({ text, x: 72, y, width: 100, height: 12, fontName: 'Helvetica', fontSize: 12, page });
    const textItems = [
      listLine('- first tagged item', 1, 700),
      listLine('1. Submit the form', 2, 700),
      listLine('2. Wait for approval', 2, 680),
      listLine('3. Pick up the permit', 2, 660)
    ];
    const parsed = base({ pageCount: 2, textItems, tags: [{ type: 'L', page: 1 }, { type: 'LI', page: 1 }] });
    const findings = rule('LST-001').evaluate({ parsed });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.location.page).toBe(2);

    const tagged = base({ pageCount: 2, textItems, tags: [{ type: 'L', page: 1 }, { type: 'L', page: 2 }] });
    expect(rule('LST-001').evaluate({ parsed: tagged })).toEqual([]);
  });
});

describe('veraPDF verdict is tied to the PDF/UA-1 profile', () => {
  it.each(['PDF/UA-1', 'PDF/UA-1 validation profile', 'PDFUA-1', 'ua1', undefined])('accepts a pass for profile %j', (profile) => {
    expect(getVerapdfComplianceVerdict({ attempted: true, compliant: true, profile })).toBe(true);
  });

  it.each(['PDF/A-1B validation profile', 'PDF/UA-2', 'WCAG 2.2 Machine & Human'])('does not treat a %j pass as PDF/UA', (profile) => {
    expect(getVerapdfComplianceVerdict({ attempted: true, compliant: true, profile })).toBeUndefined();
    expect(getVerapdfUnavailableReason({ attempted: true, compliant: true, profile })).toMatch(/not PDF\/UA-1/);
  });
});
