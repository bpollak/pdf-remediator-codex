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

/** A page is image-dominated when its images cover at least this share of it. */
export const SCANNED_PAGE_MIN_IMAGE_COVERAGE = 0.5;
/** An image-dominated page with fewer extractable characters than this reads as a scan. */
export const SCANNED_PAGE_MAX_TEXT_CHARS = 120;

function imageCoverageByPage(parsed: ParsedPDF): number[] {
  const boxes = parsed.pageBoxes ?? [];
  const covered = boxes.map(() => 0);
  for (const image of parsed.images) {
    // A described or decorative image is tagged content (a poster, a flyer,
    // a cover), not a scanned page; OCR would replace its tags.
    if (image.alt?.trim() || image.decorative) continue;
    const box = boxes[image.page - 1];
    if (!box || box.width <= 0 || box.height <= 0) continue;
    const width = Math.min(image.x + image.width, box.x + box.width) - Math.max(image.x, box.x);
    const height = Math.min(image.y + image.height, box.y + box.height) - Math.max(image.y, box.y);
    if (width <= 0 || height <= 0) continue;
    covered[image.page - 1] += (width * height) / (box.width * box.height);
  }
  return covered.map((share) => Math.min(1, share));
}

/**
 * Scanned (image-only) documents: most pages are covered by images and
 * expose little extractable text. OCR text counts as text, and a structure
 * tree does not change the answer (a tagged scan is still unreadable).
 *
 * When page geometry is unknown, or no images were found, the older
 * text-density heuristic is used.
 */
export function isLikelyScannedPdf(parsed: ParsedPDF): boolean {
  const signal = summarizePdfTextSignal(parsed);

  if (parsed.pageBoxes?.length && parsed.images.length > 0) {
    const coverage = imageCoverageByPage(parsed);
    const charsByPage = coverage.map(() => 0);
    for (const item of parsed.textItems) {
      if (item.page >= 1 && item.page <= charsByPage.length) {
        charsByPage[item.page - 1] += item.text.replace(/\s+/g, '').length;
      }
    }
    const scannedPages = coverage.filter(
      (share, index) => share >= SCANNED_PAGE_MIN_IMAGE_COVERAGE && charsByPage[index]! < SCANNED_PAGE_MAX_TEXT_CHARS
    ).length;
    return scannedPages >= Math.max(1, Math.ceil(coverage.length / 2));
  }

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
