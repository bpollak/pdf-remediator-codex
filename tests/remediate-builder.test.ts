import { describe, expect, it } from 'vitest';
import { buildRemediatedPdf } from '@/lib/remediate/builder';
import { PDFDocument } from 'pdf-lib';
import { runAudit } from '@/lib/audit/engine';
import { decodeManifest } from '@/lib/remediate/manifest';
import { parsePdfBytes } from '@/lib/pdf/parser';
import type { ParsedPDF } from '@/lib/pdf/types';

describe('buildRemediatedPdf', () => {
  it('handles characters outside WinAnsi encoding without throwing', async () => {
    const parsed: ParsedPDF = {
      pageCount: 1,
      metadata: {},
      hasStructTree: false,
      tags: [],
      textItems: [{ text: 'Budget \u25cf Analysis', x: 40, y: 720, width: 150, height: 12, fontName: 'Helvetica', fontSize: 12, page: 1 }],
      images: [],
      links: [],
      outlines: [],
      forms: []
    };

    const bytes = await buildRemediatedPdf(parsed, 'en-US');
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('preserves original page dimensions when source bytes are provided', async () => {
    const sourcePdf = await PDFDocument.create();
    sourcePdf.addPage([420, 595]).drawText('Original first page', { x: 60, y: 520, size: 18 });
    sourcePdf.addPage([612, 792]).drawText('Original second page', { x: 72, y: 700, size: 14 });
    const sourceBytes = await sourcePdf.save();

    const parsed: ParsedPDF = {
      pageCount: 2,
      metadata: {},
      hasStructTree: false,
      tags: [],
      textItems: [],
      images: [],
      links: [],
      outlines: [],
      forms: []
    };

    const remediatedBytes = await buildRemediatedPdf(parsed, 'en-US', sourceBytes);
    const remediatedPdf = await PDFDocument.load(remediatedBytes);

    expect(remediatedPdf.getPageCount()).toBe(2);
    expect(remediatedPdf.getPages()[0]?.getWidth()).toBeCloseTo(420, 3);
    expect(remediatedPdf.getPages()[0]?.getHeight()).toBeCloseTo(595, 3);
    expect(remediatedPdf.getPages()[1]?.getWidth()).toBeCloseTo(612, 3);
    expect(remediatedPdf.getPages()[1]?.getHeight()).toBeCloseTo(792, 3);
  });

  it('embeds an invisible OCR text layer when local OCR fallback is used', async () => {
    const sourcePdf = await PDFDocument.create();
    sourcePdf.addPage([612, 792]);
    const sourceBytes = await sourcePdf.save();

    const parsed: ParsedPDF = {
      pageCount: 1,
      metadata: {},
      hasStructTree: false,
      tags: [],
      textItems: [
        {
          text: 'To whom so ever it may concern',
          x: 120,
          y: 520,
          width: 220,
          height: 12,
          fontName: 'OCR',
          fontSize: 12,
          page: 1
        }
      ],
      images: [],
      links: [],
      outlines: [],
      forms: []
    };

    const remediatedBytes = await buildRemediatedPdf(parsed, 'en-US', sourceBytes, { addInvisibleTextLayer: true });
    const remediatedParsed = await parsePdfBytes(remediatedBytes.slice(0));

    expect(remediatedParsed.textItems.some((item) => /to whom so ever it may concern/i.test(item.text))).toBe(true);
  });

  it('embeds compact remediation manifest without synthetic tag-tree overclaims', async () => {
    const parsed: ParsedPDF = {
      pageCount: 5,
      metadata: {},
      hasStructTree: false,
      tags: [],
      textItems: [
        { text: 'Policy Summary', x: 40, y: 720, width: 160, height: 16, fontName: 'Helvetica-Bold', fontSize: 16, page: 1 },
        { text: '- item one', x: 40, y: 680, width: 100, height: 12, fontName: 'Helvetica', fontSize: 12, page: 1 },
        { text: '- item two', x: 40, y: 660, width: 100, height: 12, fontName: 'Helvetica', fontSize: 12, page: 1 },
        { text: '- item three', x: 40, y: 640, width: 100, height: 12, fontName: 'Helvetica', fontSize: 12, page: 1 }
      ],
      images: [],
      links: [{ text: 'Detailed policy document', url: 'https://example.com/policy', page: 1 }],
      outlines: [],
      forms: [{ name: 'email', required: true }]
    };

    const originalScore = runAudit(parsed).score;
    const bytes = await buildRemediatedPdf(parsed, 'en-US');
    const remediatedPdf = await PDFDocument.load(bytes);
    const manifest = decodeManifest(remediatedPdf.getKeywords() ?? undefined);

    expect(manifest?.version).toBe(3);
    expect(manifest?.pdfUaPart).toBeUndefined();
    expect(manifest?.remediationMode).toBe('analysis-only');
    expect((manifest as Record<string, unknown> | undefined)?.tags).toBeUndefined();
    expect((manifest as Record<string, unknown> | undefined)?.forms).toBeUndefined();
    expect((manifest as Record<string, unknown> | undefined)?.images).toBeUndefined();
    expect((manifest as Record<string, unknown> | undefined)?.links).toBeUndefined();
    expect((manifest as Record<string, unknown> | undefined)?.outlines).toBeUndefined();

    const remediatedParsed = await parsePdfBytes(bytes.slice(0));
    const remediatedAudit = runAudit(remediatedParsed);
    const remediatedScore = remediatedAudit.score;

    expect(remediatedParsed.remediationMode).toBe('analysis-only');
    expect(remediatedParsed.hasStructTree).toBe(true);
    expect(remediatedParsed.structureBinding?.hasContentBinding).toBe(true);
    expect(remediatedAudit.findings.some((finding) => finding.ruleId === 'DOC-002')).toBe(false);
    expect(remediatedAudit.findings.some((finding) => finding.ruleId === 'DOC-005')).toBe(false);
    expect(remediatedScore).toBeGreaterThanOrEqual(originalScore);
    expect(remediatedScore).toBeLessThan(100);
  });

  it('does not duplicate manifest metadata across remediation passes', async () => {
    const sourcePdf = await PDFDocument.create();
    sourcePdf.addPage([612, 792]).drawText('Manifest stability check', { x: 72, y: 700, size: 14 });
    const sourceBytes = await sourcePdf.save();

    const parsed: ParsedPDF = {
      pageCount: 1,
      metadata: {},
      hasStructTree: false,
      tags: [],
      textItems: [{ text: 'Manifest stability check', x: 72, y: 700, width: 180, height: 14, fontName: 'Helvetica', fontSize: 14, page: 1 }],
      images: [],
      links: [{ text: 'Policy details', url: 'https://example.com/policy', page: 1 }],
      outlines: [],
      forms: [{ name: 'email', required: true }]
    };

    const pass1 = await buildRemediatedPdf(parsed, 'en-US', sourceBytes);
    const parsedPass1 = await parsePdfBytes(pass1.slice(0));
    const keywordLengthPass1 = parsedPass1.metadata.Keywords?.length ?? 0;

    const pass2 = await buildRemediatedPdf(parsedPass1, parsedPass1.language ?? 'en-US', pass1.slice(0));
    const parsedPass2 = await parsePdfBytes(pass2.slice(0));
    const keywordLengthPass2 = parsedPass2.metadata.Keywords?.length ?? 0;

    expect(keywordLengthPass1).toBeGreaterThan(0);
    expect(keywordLengthPass2).toBeLessThanOrEqual(keywordLengthPass1 + 128);
  });

});
