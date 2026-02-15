import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { ParsedPDF } from '@/lib/pdf/types';
import { extractRemediationPlan } from './extractor';
import { mapFontName } from './font-mapper';

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
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
  const timesRoman = await pdf.embedFont(StandardFonts.TimesRoman);
  const courier = await pdf.embedFont(StandardFonts.Courier);

  pdf.setLanguage(language || 'en-US');
  pdf.setTitle(parsed.title ?? 'Remediated PDF');
  pdf.setAuthor('AccessiblePDF Remediation');
  pdf.setSubject(parsed.metadata.Subject ?? 'Accessibility remediated document');

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
