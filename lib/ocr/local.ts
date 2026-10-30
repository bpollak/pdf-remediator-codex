import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ParsedPDF, TextItem } from '@/lib/pdf/types';
import { ensurePdfJsWorkerConfigured } from '@/lib/pdf/configure-worker';
import { mapToTesseractLang } from './language';
import { createAbortError, throwIfAborted, withDeadline } from '@/lib/client/deadline';

export const LOCAL_OCR_MAX_PAGES = 8;
// Starting tesseract downloads its core and language data (several MB) first.
export const LOCAL_OCR_SETUP_TIMEOUT_MS = 90_000;
export const LOCAL_OCR_PAGE_TIMEOUT_MS = 60_000;
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
  /** Pages with at least one accepted text line. */
  pagesProcessed: number;
  totalPages: number;
  incompletePages: number[];
}

export interface LocalOcrOptions {
  signal?: AbortSignal;
  setupTimeoutMs?: number;
  pageTimeoutMs?: number;
}

type TesseractWorker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;

export async function runLocalOcr(
  parsed: ParsedPDF,
  sourceBytes: ArrayBuffer,
  language?: string,
  options: LocalOcrOptions = {}
): Promise<LocalOcrResult> {
  const { signal, setupTimeoutMs = LOCAL_OCR_SETUP_TIMEOUT_MS, pageTimeoutMs = LOCAL_OCR_PAGE_TIMEOUT_MS } = options;
  const totalPages = parsed.pageCount;
  const incompletePages: number[] = [];
  if (typeof window === 'undefined') {
    return { attempted: false, applied: false, reason: 'Local OCR only runs in browser context', pagesProcessed: 0, totalPages, incompletePages };
  }

  ensurePdfJsWorkerConfigured();

  const pageLimit = Math.max(1, Math.min(parsed.pageCount, LOCAL_OCR_MAX_PAGES));
  const tesseractLang = mapToTesseractLang(language ?? parsed.language);

  let pagesProcessed = 0;
  const loadingTask = getDocument({ data: sourceBytes.slice(0) });

  try {
    const [{ createWorker }, doc] = await withDeadline(
      Promise.all([import('tesseract.js'), loadingTask.promise]),
      { step: 'Loading OCR', timeoutMs: setupTimeoutMs, signal }
    );
    const workerPromise = createWorker(tesseractLang);
    let worker: TesseractWorker;
    try {
      worker = await withDeadline(workerPromise, { step: 'Starting OCR', timeoutMs: setupTimeoutMs, signal });
    } catch (error) {
      // The worker may still start after we gave up; shut it down when it does.
      workerPromise.then((late) => late.terminate()).catch(() => undefined);
      throw error;
    }
    const ocrItems: TextItem[] = [];

    try {
      for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
        throwIfAborted(signal);
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
            const recognition = (await withDeadline(worker.recognize(canvas), {
              step: `OCR of page ${pageNumber}`,
              timeoutMs: pageTimeoutMs,
              signal
            })) as OcrRecognitionLike;
            const beforeItems = ocrItems.length;
            const lines = recognition.data?.lines ?? [];

            let rejectedText = false;
            for (const line of lines) {
              const item = ocrLineToTextItem(line, pageNumber, viewport);
              if (item) ocrItems.push(item);
              else if (normalizeText(line.text)) rejectedText = true;
            }
            if (ocrItems.length > beforeItems && !rejectedText) pagesProcessed += 1;
            else incompletePages.push(pageNumber);
          } finally {
            canvas.width = 0;
            canvas.height = 0;
          }
        } finally {
          page.cleanup();
        }
      }
    } finally {
      // Terminating also stops a recognize() that ran past its deadline.
      await worker.terminate().catch(() => undefined);
      doc.cleanup();
    }

    // Scale minimum text threshold by pages processed — a single-page scan
    // may legitimately have few lines, but multi-page docs should yield more.
    const minItems = Math.max(5, pageLimit * 3);
    if (ocrItems.length < minItems) {
      return {
        attempted: true,
        applied: false,
        reason: `Local OCR did not detect enough text (found ${ocrItems.length}, need ${minItems})`,
        pagesProcessed,
        totalPages,
        incompletePages
      };
    }

    return {
      attempted: true,
      applied: true,
      parsed: {
        ...parsed,
        language: parsed.language ?? language ?? 'en-US',
        textItems: [...parsed.textItems, ...ocrItems]
      },
      pagesProcessed,
      totalPages,
      incompletePages
    };
  } catch (error) {
    if (signal?.aborted) throw createAbortError();
    return {
      attempted: true,
      applied: false,
      reason: error instanceof Error ? error.message : 'Unknown local OCR error',
      pagesProcessed,
      totalPages,
      incompletePages
    };
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}
