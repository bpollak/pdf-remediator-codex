import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ParsedPDF, TextItem } from '@/lib/pdf/types';
import { ensurePdfJsWorkerConfigured } from '@/lib/pdf/configure-worker';

const TRITON_OCR_API_PATH = '/api/ocr/tritonai';
const TRITON_OCR_MAX_PAGES = 8;
const TRITON_OCR_SCALE = 1.4;
const TRITON_OCR_LINE_HEIGHT = 12;

interface TritonOcrLine {
  text: string;
}

interface TritonOcrResponse {
  lines?: TritonOcrLine[];
  text?: string;
  error?: string;
  warning?: string;
  attemptedModels?: Array<{ model: string; status?: number }>;
}

export interface TritonOcrResult {
  attempted: boolean;
  applied: boolean;
  parsed?: ParsedPDF;
  reason?: string;
}

function normalizeText(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function pageOcrLinesToTextItems(lines: TritonOcrLine[], page: number, pageWidth: number, pageHeight: number): TextItem[] {
  const topMargin = 54;
  const leftMargin = 36;
  const usableWidth = Math.max(1, pageWidth - leftMargin * 2);

  return lines
    .map((line, index) => {
      const text = normalizeText(line.text);
      if (!text) return undefined;
      const y = Math.max(24, pageHeight - topMargin - index * TRITON_OCR_LINE_HEIGHT);

      return {
        text,
        x: leftMargin,
        y,
        width: usableWidth,
        height: TRITON_OCR_LINE_HEIGHT,
        fontName: 'OCR',
        fontSize: 10,
        page
      };
    })
    .filter((item): item is TextItem => Boolean(item));
}

async function renderPageToDataUrl(input: {
  doc: Awaited<ReturnType<typeof getDocument>['promise']>;
  pageNumber: number;
}): Promise<{ imageDataUrl: string; pageWidth: number; pageHeight: number }> {
  const page = await input.doc.getPage(input.pageNumber);

  try {
    const viewport = page.getViewport({ scale: TRITON_OCR_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    try {
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas context unavailable');

      await page.render({ canvasContext: context, viewport }).promise;

      return {
        imageDataUrl: canvas.toDataURL('image/png'),
        pageWidth: viewport.width / TRITON_OCR_SCALE,
        pageHeight: viewport.height / TRITON_OCR_SCALE
      };
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    page.cleanup();
  }
}

async function requestPageOcr(input: {
  imageDataUrl: string;
  page: number;
  documentName: string;
  language?: string;
}): Promise<{ lines: TritonOcrLine[]; warning?: string }> {
  const response = await fetch(TRITON_OCR_API_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  const payload = (await response.json().catch(() => ({}))) as TritonOcrResponse;

  if (!response.ok) {
    throw new Error(payload.error || `TritonAI OCR request failed (${response.status})`);
  }

  let lines: TritonOcrLine[] = [];
  if (Array.isArray(payload.lines)) {
    lines = payload.lines
      .map((line) => ({ text: normalizeText(line.text) }))
      .filter((line) => line.text);
  } else if (typeof payload.text === 'string') {
    lines = payload.text
      .split(/\r?\n/)
      .map((text) => ({ text: normalizeText(text) }))
      .filter((line) => line.text);
  }

  return { lines, warning: payload.warning };
}

export async function runTritonAiOcr(
  parsed: ParsedPDF,
  sourceBytes: ArrayBuffer,
  documentName: string,
  language?: string
): Promise<TritonOcrResult> {
  if (typeof window === 'undefined') {
    return { attempted: false, applied: false, reason: 'TritonAI OCR only runs in browser context' };
  }

  ensurePdfJsWorkerConfigured();

  const pageLimit = Math.max(1, Math.min(parsed.pageCount, TRITON_OCR_MAX_PAGES));
  const loadingTask = getDocument({ data: sourceBytes.slice(0) });

  try {
    const doc = await loadingTask.promise;
    const ocrItems: TextItem[] = [];
    const pageWarnings: string[] = [];

    try {
      for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
        try {
          const rendered = await renderPageToDataUrl({ doc, pageNumber });
          const result = await requestPageOcr({
            imageDataUrl: rendered.imageDataUrl,
            page: pageNumber,
            documentName,
            language: language ?? parsed.language
          });
          if (result.warning) {
            pageWarnings.push(`Page ${pageNumber}: ${result.warning}`);
          }
          ocrItems.push(...pageOcrLinesToTextItems(result.lines, pageNumber, rendered.pageWidth, rendered.pageHeight));
        } catch (error) {
          pageWarnings.push(
            `Page ${pageNumber}: ${error instanceof Error ? error.message : 'TritonAI OCR did not complete'}`
          );
        }
      }
    } finally {
      doc.cleanup();
      await loadingTask.destroy().catch(() => undefined);
    }

    const minItems = Math.max(3, pageLimit * 2);
    if (ocrItems.length < minItems) {
      return {
        attempted: true,
        applied: false,
        reason: [
          `TritonAI OCR did not detect enough text (found ${ocrItems.length}, need ${minItems})`,
          pageWarnings.slice(0, 3).join('; ')
        ].filter(Boolean).join(': ')
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
      reason: pageWarnings.length > 0 ? pageWarnings.slice(0, 3).join('; ') : undefined
    };
  } catch (error) {
    return {
      attempted: true,
      applied: false,
      reason: error instanceof Error ? error.message : 'Unknown TritonAI OCR error'
    };
  }
}
