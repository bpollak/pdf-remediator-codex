import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ParsedPDF, TextItem } from '@/lib/pdf/types';
import { ensurePdfJsWorkerConfigured } from '@/lib/pdf/configure-worker';
import { createAbortError, deadlineSignal, sleep, throwIfAborted } from '@/lib/client/deadline';
import { redactConfigNames } from '@/lib/client/error-copy';

const TRITON_OCR_API_PATH = '/api/ocr/tritonai';
export const TRITON_OCR_MAX_PAGES = 8;
const TRITON_OCR_SCALE = 1.4;
const TRITON_OCR_LINE_HEIGHT = 12;
// The server route tries up to three models within its 120 s limit.
const TRITON_OCR_PAGE_TIMEOUT_MS = 130_000;
// Wait at most this long when the server asks us to slow down.
const MAX_RETRY_AFTER_MS = 30_000;
const DEFAULT_RETRY_AFTER_MS = 5_000;
// After "not configured" or a rejected key, skip TritonAI for later files too.
const SERVICE_UNAVAILABLE_COOLDOWN_MS = 10 * 60_000;
let serviceUnavailableUntil = 0;

const NOT_AVAILABLE_REASON = 'TritonAI OCR is not available on this site';

// Stable `code` values the server sends with every error response.
const TRITON_ERROR_CODES = [
  'invalid_request',
  'payload_too_large',
  'rate_limited',
  'cross_site',
  'not_configured',
  'misconfigured',
  'upstream_auth',
  'upstream_timeout',
  'upstream_error',
  'internal_error'
] as const;
type TritonErrorCode = (typeof TRITON_ERROR_CODES)[number];
/** Every later page would fail the same way: stop calling the server. */
const STOP_CODES = new Set<TritonErrorCode>(['not_configured', 'misconfigured', 'upstream_auth']);

/** A failed page request, with the server's stable error code when it sent one. */
class TritonPageError extends Error {
  constructor(message: string, readonly code: TritonErrorCode | undefined, readonly retryAfterMs?: number) {
    super(message);
    this.name = 'TritonPageError';
  }
}

export function __resetTritonOcrCircuitForTests() {
  serviceUnavailableUntil = 0;
}

interface TritonOcrLine {
  text: string;
}

interface TritonOcrResponse {
  lines?: TritonOcrLine[];
  text?: string;
  code?: string;
  error?: string;
  warning?: string;
  complete?: boolean;
  attemptedModels?: Array<{ model: string; status?: number }>;
}

export interface TritonOcrResult {
  attempted: boolean;
  applied: boolean;
  parsed?: ParsedPDF;
  reason?: string;
  /** Pages with nonempty extraction that was not cut off or limited. */
  pagesProcessed: number;
  totalPages: number;
  incompletePages: number[];
}

export interface TritonOcrOptions {
  signal?: AbortSignal;
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

function errorCodeFor(status: number, code: unknown): TritonErrorCode | undefined {
  if (typeof code === 'string' && (TRITON_ERROR_CODES as readonly string[]).includes(code)) {
    return code as TritonErrorCode;
  }
  // Older server responses carry no code.
  if (status === 503) return 'not_configured';
  if (status === 401 || status === 403) return 'upstream_auth';
  if (status === 429) return 'rate_limited';
  if (status === 504) return 'upstream_timeout';
  if (status === 413) return 'payload_too_large';
  return undefined;
}

function messageFor(code: TritonErrorCode | undefined, status: number, serverMessage: string | undefined): string {
  if (code && STOP_CODES.has(code)) return NOT_AVAILABLE_REASON;
  if (code === 'upstream_timeout') return 'TritonAI OCR timed out';
  if (code === 'payload_too_large') return 'This page is too large for TritonAI OCR';
  if (code === 'rate_limited') return 'TritonAI OCR is busy';
  return serverMessage ? redactConfigNames(serverMessage) : `TritonAI OCR request failed (${status})`;
}

function parseRetryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get('retry-after'));
  const ms = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_AFTER_MS;
  return Math.min(ms, MAX_RETRY_AFTER_MS);
}

async function requestPageOcr(input: {
  imageDataUrl: string;
  page: number;
  documentName: string;
  language?: string;
}, signal?: AbortSignal): Promise<{ lines: TritonOcrLine[]; warning?: string; complete: boolean }> {
  const deadline = deadlineSignal(TRITON_OCR_PAGE_TIMEOUT_MS, signal);
  let response: Response;
  let payload: TritonOcrResponse;
  try {
    response = await fetch(TRITON_OCR_API_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: deadline.signal
    });
    payload = (await response.json().catch(() => ({}))) as TritonOcrResponse;
  } catch (error) {
    if (signal?.aborted) throw createAbortError();
    if (deadline.timedOut()) throw new TritonPageError('TritonAI OCR timed out', 'upstream_timeout');
    throw error;
  } finally {
    deadline.dispose();
  }

  if (!response.ok) {
    const code = errorCodeFor(response.status, payload.code);
    throw new TritonPageError(
      messageFor(code, response.status, payload.error),
      code,
      code === 'rate_limited' ? parseRetryAfterMs(response) : undefined
    );
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

  return { lines, warning: payload.warning, complete: payload.complete !== false && !payload.warning && lines.length > 0 };
}

export async function runTritonAiOcr(
  parsed: ParsedPDF,
  sourceBytes: ArrayBuffer,
  documentName: string,
  language?: string,
  options: TritonOcrOptions = {}
): Promise<TritonOcrResult> {
  const { signal } = options;
  const totalPages = parsed.pageCount;
  const incompletePages: number[] = [];
  if (typeof window === 'undefined') {
    return { attempted: false, applied: false, reason: 'TritonAI OCR only runs in browser context', pagesProcessed: 0, totalPages, incompletePages };
  }
  if (Date.now() < serviceUnavailableUntil) {
    return { attempted: false, applied: false, reason: NOT_AVAILABLE_REASON, pagesProcessed: 0, totalPages, incompletePages };
  }

  ensurePdfJsWorkerConfigured();

  const pageLimit = Math.max(1, Math.min(parsed.pageCount, TRITON_OCR_MAX_PAGES));
  const loadingTask = getDocument({ data: sourceBytes.slice(0) });
  let pagesProcessed = 0;

  try {
    const doc = await loadingTask.promise;
    const ocrItems: TextItem[] = [];
    const pageWarnings: string[] = [];
    let waitedForRateLimit = false;

    try {
      for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
        throwIfAborted(signal);
        try {
          const rendered = await renderPageToDataUrl({ doc, pageNumber });
          const request = () =>
            requestPageOcr(
              {
                imageDataUrl: rendered.imageDataUrl,
                page: pageNumber,
                documentName,
                language: language ?? parsed.language
              },
              signal
            );
          let result: Awaited<ReturnType<typeof requestPageOcr>>;
          try {
            result = await request();
          } catch (error) {
            // Honour Retry-After once per document, then give up on TritonAI.
            if (!(error instanceof TritonPageError) || error.code !== 'rate_limited' || waitedForRateLimit) throw error;
            waitedForRateLimit = true;
            await sleep(error.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS, signal);
            result = await request();
          }
          if (result.complete) pagesProcessed += 1;
          else incompletePages.push(pageNumber);
          if (result.warning) {
            pageWarnings.push(`Page ${pageNumber}: ${result.warning}`);
          }
          ocrItems.push(...pageOcrLinesToTextItems(result.lines, pageNumber, rendered.pageWidth, rendered.pageHeight));
        } catch (error) {
          if (signal?.aborted) throw createAbortError();
          incompletePages.push(pageNumber);
          pageWarnings.push(
            `Page ${pageNumber}: ${error instanceof Error ? error.message : 'TritonAI OCR did not complete'}`
          );
          if (error instanceof TritonPageError) {
            // Every later page would fail the same way; stop calling the server.
            if (error.code && STOP_CODES.has(error.code)) {
              serviceUnavailableUntil = Date.now() + SERVICE_UNAVAILABLE_COOLDOWN_MS;
              break;
            }
            if (error.code === 'rate_limited') break;
          }
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
        ].filter(Boolean).join(': '),
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
      reason: pageWarnings.length > 0 ? pageWarnings.slice(0, 3).join('; ') : undefined,
      pagesProcessed,
      totalPages,
      incompletePages
    };
  } catch (error) {
    if (signal?.aborted) throw createAbortError();
    return {
      attempted: true,
      applied: false,
      reason: error instanceof Error ? redactConfigNames(error.message) : 'Unknown TritonAI OCR error',
      pagesProcessed,
      totalPages,
      incompletePages
    };
  }
}
