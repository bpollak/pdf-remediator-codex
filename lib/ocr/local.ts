import { getDocument } from 'pdfjs-dist';
import type { ParsedPDF, TextItem } from '@/lib/pdf/types';
import { ensurePdfJsWorkerConfigured } from '@/lib/pdf/configure-worker';

const LOCAL_OCR_MAX_PAGES = 8;
const LOCAL_OCR_SCALE = 1.6;
const LOCAL_OCR_MIN_CONFIDENCE = 35;

function mapToTesseractLang(language?: string): string {
  if (!language) return 'eng';
  const normalized = language.toLowerCase();
  if (normalized.startsWith('en')) return 'eng';
  if (normalized.startsWith('es')) return 'spa';
  if (normalized.startsWith('fr')) return 'fra';
  if (normalized.startsWith('de')) return 'deu';
  if (normalized.startsWith('it')) return 'ita';
  if (normalized.startsWith('pt')) return 'por';
  return 'eng';
}

function normalizeText(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

interface OcrLineLike {
  text?: string;
  confidence?: number;
  bbox?: { x0?: number; y0?: number; x1?: number; y1?: number };
}

function ocrLineToTextItem(line: OcrLineLike, page: number, viewportHeight: number, viewportScale: number): TextItem | null {
  const text = normalizeText(line.text);
  if (!text) return null;

  const confidence = typeof line.confidence === 'number' ? line.confidence : 100;
  if (confidence < LOCAL_OCR_MIN_CONFIDENCE) return null;

  const x0 = line.bbox?.x0 ?? 0;
  const y0 = line.bbox?.y0 ?? 0;
  const x1 = line.bbox?.x1 ?? x0 + 1;
  const y1 = line.bbox?.y1 ?? y0 + 1;
  const width = Math.max(1, (x1 - x0) / viewportScale);
  const height = Math.max(1, (y1 - y0) / viewportScale);
  const y = Math.max(0, (viewportHeight - y1) / viewportScale);

  return {
    text,
    x: Math.max(0, x0 / viewportScale),
    y,
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
    const [{ createWorker }, loadingTask] = await Promise.all([
      import('tesseract.js'),
      Promise.resolve(getDocument({ data: sourceBytes }))
    ]);

    const doc = await loadingTask.promise;
    const worker = await createWorker(tesseractLang);
    const ocrItems: TextItem[] = [];

    try {
      for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
        const page = await doc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: LOCAL_OCR_SCALE });

        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) continue;

        await page.render({ canvasContext: context, viewport }).promise;
        const recognition = await worker.recognize(canvas);
        const lines = ((recognition as any)?.data?.lines ?? []) as OcrLineLike[];

        for (const line of lines) {
          const item = ocrLineToTextItem(line, pageNumber, viewport.height, LOCAL_OCR_SCALE);
          if (item) ocrItems.push(item);
        }
      }
    } finally {
      await worker.terminate();
    }

    if (ocrItems.length < 5) {
      return {
        attempted: true,
        applied: false,
        reason: 'Local OCR did not detect enough text'
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
