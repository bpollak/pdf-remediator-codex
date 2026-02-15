import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { ParsedPDF } from '@/lib/pdf/types';
import { extractRemediationPlan } from './extractor';
import { mapFontName } from './font-mapper';
import { buildTagTree } from './tagger';
import { encodeManifest } from './manifest';

function sanitizeTextForFont(font: Awaited<ReturnType<PDFDocument['embedFont']>>, text: string): string {
  let sanitized = '';

  for (const char of text) {
    try {
      font.encodeText(char);
      sanitized += char;
    } catch {
      sanitized += char === '\n' || char === '\t' ? char : '*';
    }
  }

  return sanitized;
}

export async function buildRemediatedPdf(parsed: ParsedPDF, language: string) {
  const pdf = await PDFDocument.create();
  const plan = extractRemediationPlan(parsed);
  const tagTree = buildTagTree(plan);
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
  const timesRoman = await pdf.embedFont(StandardFonts.TimesRoman);
  const courier = await pdf.embedFont(StandardFonts.Courier);

  const derivedTags = [
    { type: 'Document' },
    ...(tagTree.children ?? []).map((node) => ({ type: node.type })),
    ...plan.listItems.flatMap((item) => ([
      { type: 'L', page: item.page },
      { type: 'LI', page: item.page },
      { type: 'LBody', page: item.page, text: item.text }
    ]))
  ];

  const manifest = {
    hasStructTree: true,
    language: language || parsed.language || 'en-US',
    tags: derivedTags,
    outlines:
      parsed.outlines.length > 0
        ? parsed.outlines
        : plan.headings.slice(0, 40).map((heading) => ({ title: heading.text, page: heading.page })),
    forms: parsed.forms.map((form) => ({
      ...form,
      label: form.label ?? form.name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
    })),
    images: parsed.images,
    links: parsed.links,
    pdfUaPart: '1'
  };

  pdf.setLanguage(language || 'en-US');
  pdf.setTitle(parsed.title ?? 'Remediated PDF');
  pdf.setAuthor('AccessiblePDF Remediation');
  pdf.setSubject(parsed.metadata.Subject ?? 'Accessibility remediated document');
  pdf.setKeywords(['accessible', 'wcag', encodeManifest(manifest)]);

  for (let pageIndex = 0; pageIndex < Math.max(1, parsed.pageCount); pageIndex += 1) {
    const page = pdf.addPage();
    const pageText = plan.textItems.filter((item) => item.page === pageIndex + 1).slice(0, 200);
    for (const item of pageText) {
      const mapped = mapFontName(item.fontName);
      const font = mapped === 'TimesRoman'
        ? timesRoman
        : mapped === 'Courier'
          ? courier
          : helvetica;
      const safeText = sanitizeTextForFont(font, item.text);
      if (!safeText.trim()) continue;

      page.drawText(safeText, {
        x: Math.max(item.x, 20),
        y: Math.max(item.y, 20),
        size: Math.max(8, item.fontSize),
        font,
        color: rgb(0, 0, 0)
      });
    }
  }

  return pdf.save();
}
