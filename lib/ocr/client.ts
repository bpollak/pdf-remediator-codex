import { mapToTesseractLang } from './language';

const OCR_API_PATH = '/api/ocr';
const CLIENT_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([502, 504]);
const SERVICE_UNAVAILABLE_COOLDOWN_MS = 5 * 60_000;
const SERVICE_UNAVAILABLE_STATUSES = new Set([404, 501, 503]);
let serviceUnavailableUntil = 0;

function summarizeError(status: number): string {
  if (status === 404 || status === 501 || status === 503) return 'OCR service unavailable';
  if (status === 413) return 'OCR input exceeds deployment upload limits';
  if (status === 504) return 'OCR request timed out';
  return `OCR request failed (${status})`;
}

function isServiceUnavailable(status: number): boolean {
  return SERVICE_UNAVAILABLE_STATUSES.has(status);
}

function markServiceUnavailable(): void {
  serviceUnavailableUntil = Date.now() + SERVICE_UNAVAILABLE_COOLDOWN_MS;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface OcrResult {
  bytes?: ArrayBuffer;
  attempted: boolean;
  reason?: string;
}

async function attemptOcrFetch(formData: FormData, signal: AbortSignal): Promise<Response> {
  return fetch(OCR_API_PATH, {
    method: 'POST',
    body: formData,
    signal
  });
}

export function __resetOcrApiCircuitForTests() {
  serviceUnavailableUntil = 0;
}

export async function runOcrViaApi(bytes: ArrayBuffer, fileName: string, language?: string): Promise<OcrResult> {
  if (Date.now() < serviceUnavailableUntil) {
    return { attempted: false, reason: 'OCR service unavailable' };
  }

  const formData = new FormData();
  formData.append('file', new File([bytes], fileName, { type: 'application/pdf' }));
  formData.append('language', mapToTesseractLang(language));

  let lastReason = '';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await delay(1000 * 2 ** (attempt - 1)); // 1s, 2s backoff
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    try {
      const response = await attemptOcrFetch(formData, controller.signal);

      if (!response.ok) {
        lastReason = summarizeError(response.status);
        if (isServiceUnavailable(response.status)) {
          markServiceUnavailable();
          return { attempted: true, reason: lastReason };
        }
        if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
          continue; // retry on transient errors
        }
        return { attempted: true, reason: lastReason };
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/pdf')) {
        return { attempted: true, reason: 'OCR response was not a PDF' };
      }

      const ocrBytes = await response.arrayBuffer();
      if (!ocrBytes.byteLength) {
        return { attempted: true, reason: 'OCR returned an empty PDF' };
      }

      return { attempted: true, bytes: ocrBytes };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        lastReason = 'OCR request timed out';
        if (attempt < MAX_RETRIES) continue;
        return { attempted: true, reason: lastReason };
      }
      lastReason = error instanceof Error ? error.message : 'Unknown OCR error';
      if (attempt < MAX_RETRIES) continue;
      return { attempted: true, reason: lastReason };
    } finally {
      clearTimeout(timer);
    }
  }

  return { attempted: true, reason: lastReason || 'OCR failed after retries' };
}
