import type { ParsedPDF } from '@/lib/pdf/types';

export function isLikelyScannedPdf(parsed: ParsedPDF): boolean {
  const pageCount = Math.max(1, parsed.pageCount);
  const totalNonWhitespaceChars = parsed.textItems.reduce((sum, item) => sum + item.text.replace(/\s+/g, '').length, 0);
  const textItemsPerPage = parsed.textItems.length / pageCount;
  const nonWhitespaceChars = totalNonWhitespaceChars / pageCount;
  const avgCharsPerTextItem = totalNonWhitespaceChars / Math.max(1, parsed.textItems.length);

  const hasSemanticSignals =
    parsed.hasStructTree || parsed.tags.length > 0 || parsed.forms.length > 0 || parsed.outlines.length > 0;

  if (hasSemanticSignals) return false;

  // Avoid OCR for short, born-digital documents that already expose coherent text.
  const hasReadableTextSignal = textItemsPerPage >= 2 && nonWhitespaceChars >= 20 && avgCharsPerTextItem >= 6;
  if (hasReadableTextSignal) return false;

  return textItemsPerPage < 20 && nonWhitespaceChars < 120;
}
