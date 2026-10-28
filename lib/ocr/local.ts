import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ParsedPDF, TextItem } from '@/lib/pdf/types';
import { ensurePdfJsWorkerConfigured } from '@/lib/pdf/configure-worker';
import { mapToTesseractLang } from './language';

const LOCAL_OCR_MAX_PAGES = 8;
const LOCAL_OCR_SCALE = 1.6;
const LOCAL_OCR_MIN_CONFIDENCE = 35;

function normalizeText(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

interface OcrLineLike {
  text?: string;
  confidence?: number;
  bbox?: { x0?: number; y0?: number; x1?: number; y1?: number };
}

interface OcrRecognitionLike {
  data?: {
    lines?: OcrLineLike[];
  };
}

interface ViewportPointMapper {
  convertToPdfPoint: (x: number, y: number) => number[];
}

/**
 * Converts a Tesseract line (bbox in rendered-canvas pixels, origin top
 * left) to a TextItem in PDF user space, using the page viewport so /Rotate
 * and a MediaBox that does not start at 0,0 are handled. x/y is the start
 * of the line's baseline (bottom-left of the box as seen on screen).
 */
export function ocrLineToTextItem(line: OcrLineLike, page: number, viewport: ViewportPointMapper): TextItem | null {
  const text = normalizeText(line.text);
  if (!text) return null;

  const confidence = typeof line.confidence === 'number' ? line.confidence : 100;
  if (confidence < LOCAL_OCR_MIN_CONFIDENCE) return null;

  const x0 = line.bbox?.x0 ?? 0;
  const y0 = line.bbox?.y0 ?? 0;
  const x1 = line.bbox?.x1 ?? x0 + 1;
  const y1 = line.bbox?.y1 ?? y0 + 1;

  const [originX, originY] = viewport.convertToPdfPoint(x0, y1) as [number, number];
  const [endX, endY] = viewport.convertToPdfPoint(x1, y1) as [number, number];
  const [topX, topY] = viewport.convertToPdfPoint(x0, y0) as [number, number];
  const width = Math.max(1, Math.hypot(endX - originX, endY - originY));
  const height = Math.max(1, Math.hypot(topX - originX, topY - originY));

  return {
    text,
    x: originX,
    y: originY,
    width,
    height,
    fontName: 'OCR',
    fontSize: Math.max(8, height * 0.85),
    page
  };
}

export interface LocalOcrResult {
  attempted: boolean;
  applied: boolean;
  parsed?: ParsedPDF;
  reason?: string;
}

export async function runLocalOcr(parsed: ParsedPDF, sourceBytes: ArrayBuffer, language?: string): Promise<LocalOcrResult> {
  if (typeof window === 'undefined') {
    return { attempted: false, applied: false, reason: 'Local OCR only runs in browser context' };
  }

  ensurePdfJsWorkerConfigured();

  const pageLimit = Math.max(1, Math.min(parsed.pageCount, LOCAL_OCR_MAX_PAGES));
  const tesseractLang = mapToTesseractLang(language ?? parsed.language);

  try {
    const loadingTask = getDocument({ data: sourceBytes.slice(0) });

    const [{ createWorker }, doc] = await Promise.all([
      import('tesseract.js'),
      loadingTask.promise
    ]);
    const worker = await createWorker(tesseractLang);
    const ocrItems: TextItem[] = [];

    try {
      for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
        const page = await doc.getPage(pageNumber);

        try {
          const viewport = page.getViewport({ scale: LOCAL_OCR_SCALE });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);

          try {
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) continue;

            await page.render({ canvasContext: context, viewport }).promise;
            const recognition = (await worker.recognize(canvas)) as OcrRecognitionLike;
            const lines = recognition.data?.lines ?? [];

            for (const line of lines) {
              const item = ocrLineToTextItem(line, pageNumber, viewport);
              if (item) ocrItems.push(item);
            }
          } finally {
            canvas.width = 0;
            canvas.height = 0;
          }
        } finally {
          page.cleanup();
        }
      }
    } finally {
      await worker.terminate();
      doc.cleanup();
      await loadingTask.destroy().catch(() => undefined);
    }

    // Scale minimum text threshold by pages processed — a single-page scan
    // may legitimately have few lines, but multi-page docs should yield more.
    const minItems = Math.max(5, pageLimit * 3);
    if (ocrItems.length < minItems) {
      return {
        attempted: true,
        applied: false,
        reason: `Local OCR did not detect enough text (found ${ocrItems.length}, need ${minItems})`
      };
    }

    return {
      attempted: true,
      applied: true,
      parsed: {
        ...parsed,
        language: parsed.language ?? language ?? 'en-US',
        textItems: [...parsed.textItems, ...ocrItems]
      }
    };
  } catch (error) {
    return {
      attempted: true,
      applied: false,
      reason: error instanceof Error ? error.message : 'Unknown local OCR error'
    };
  }
}
