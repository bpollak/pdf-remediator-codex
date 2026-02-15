import { describe, expect, it } from 'vitest';
import { buildRemediatedPdf } from '@/lib/remediate/builder';
import { PDFDocument } from 'pdf-lib';
import { runAudit } from '@/lib/audit/engine';
import { decodeManifest } from '@/lib/remediate/manifest';
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

  it('embeds remediation manifest so post-remediation audits reflect applied fixes', async () => {
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

    expect(manifest?.hasStructTree).toBe(true);
    expect(manifest?.pdfUaPart).toBe('1');
    expect(manifest?.forms[0]?.label).toBe('Email');

    const remediatedParsed: ParsedPDF = {
      ...parsed,
      metadata: { ...parsed.metadata, Subject: parsed.metadata.Subject, 'pdfuaid:part': manifest?.pdfUaPart },
      language: manifest?.language,
      hasStructTree: manifest?.hasStructTree ?? false,
      tags: manifest?.tags ?? [],
      outlines: manifest?.outlines ?? [],
      forms: manifest?.forms ?? parsed.forms
    };
    const remediatedScore = runAudit(remediatedParsed).score;

    expect(remediatedScore).toBeGreaterThan(originalScore + 10);
  });

});
