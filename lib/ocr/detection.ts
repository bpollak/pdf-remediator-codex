import type { ParsedPDF } from '@/lib/pdf/types';

export interface PdfTextSignal {
  totalTextItems: number;
  totalNonWhitespaceChars: number;
  textItemsPerPage: number;
  nonWhitespaceCharsPerPage: number;
  avgCharsPerTextItem: number;
}

export interface OcrTextGainAssessment {
  accepted: boolean;
  reason?: string;
  before: PdfTextSignal;
  after: PdfTextSignal;
}

export function summarizePdfTextSignal(parsed: ParsedPDF): PdfTextSignal {
  const pageCount = Math.max(1, parsed.pageCount);
  const totalTextItems = parsed.textItems.length;
  const totalNonWhitespaceChars = parsed.textItems.reduce((sum, item) => sum + item.text.replace(/\s+/g, '').length, 0);

  return {
    totalTextItems,
    totalNonWhitespaceChars,
    textItemsPerPage: totalTextItems / pageCount,
    nonWhitespaceCharsPerPage: totalNonWhitespaceChars / pageCount,
    avgCharsPerTextItem: totalNonWhitespaceChars / Math.max(1, totalTextItems)
  };
}

export function isLikelyScannedPdf(parsed: ParsedPDF): boolean {
  const signal = summarizePdfTextSignal(parsed);

  const hasSemanticSignals =
    parsed.hasStructTree || parsed.tags.length > 0 || parsed.forms.length > 0 || parsed.outlines.length > 0;

  if (hasSemanticSignals) return false;

  // Avoid OCR for short, born-digital documents that already expose coherent text.
  const hasReadableTextSignal =
    signal.textItemsPerPage >= 2 && signal.nonWhitespaceCharsPerPage >= 20 && signal.avgCharsPerTextItem >= 6;
  if (hasReadableTextSignal) return false;

  return signal.textItemsPerPage < 20 && signal.nonWhitespaceCharsPerPage < 120;
}

export function assessOcrTextGain(before: ParsedPDF, after: ParsedPDF): OcrTextGainAssessment {
  const beforeSignal = summarizePdfTextSignal(before);
  const afterSignal = summarizePdfTextSignal(after);

  if (afterSignal.totalTextItems === 0 || afterSignal.totalNonWhitespaceChars === 0) {
    return {
      accepted: false,
      reason: 'OCR output did not expose any searchable text',
      before: beforeSignal,
      after: afterSignal
    };
  }

  const charGain = afterSignal.totalNonWhitespaceChars - beforeSignal.totalNonWhitespaceChars;
  const itemGain = afterSignal.totalTextItems - beforeSignal.totalTextItems;
  const nowReadable =
    afterSignal.textItemsPerPage >= 4 &&
    afterSignal.nonWhitespaceCharsPerPage >= 40 &&
    afterSignal.avgCharsPerTextItem >= 3;
  const strongGrowth =
    charGain >= Math.max(80, Math.floor(beforeSignal.totalNonWhitespaceChars * 0.5)) ||
    itemGain >= Math.max(8, beforeSignal.totalTextItems);

  if (nowReadable || !isLikelyScannedPdf(after) || strongGrowth) {
    return {
      accepted: true,
      before: beforeSignal,
      after: afterSignal
    };
  }

  return {
    accepted: false,
    reason: `OCR output did not add enough searchable text (chars +${charGain}, items +${itemGain})`,
    before: beforeSignal,
    after: afterSignal
  };
}
