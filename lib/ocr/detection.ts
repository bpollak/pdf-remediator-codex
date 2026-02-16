import type { ParsedPDF } from '@/lib/pdf/types';

export function isLikelyScannedPdf(parsed: ParsedPDF): boolean {
  const pageCount = Math.max(1, parsed.pageCount);
  const textItemsPerPage = parsed.textItems.length / pageCount;
  const nonWhitespaceChars =
    parsed.textItems.reduce((sum, item) => sum + item.text.replace(/\s+/g, '').length, 0) / pageCount;

  const hasSemanticSignals =
    parsed.hasStructTree || parsed.tags.length > 0 || parsed.forms.length > 0 || parsed.outlines.length > 0;

  if (hasSemanticSignals) return false;

  return textItemsPerPage < 20 && nonWhitespaceChars < 120;
}
