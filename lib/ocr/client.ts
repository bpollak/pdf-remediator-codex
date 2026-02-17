import { mapToTesseractLang } from './language';

const OCR_API_PATH = '/api/ocr';

function summarizeError(status: number): string {
  if (status === 404 || status === 501 || status === 503) return 'OCR service unavailable';
  if (status === 413) return 'OCR input exceeds deployment upload limits';
  if (status === 504) return 'OCR request timed out';
  return `OCR request failed (${status})`;
}

export interface OcrResult {
  bytes?: ArrayBuffer;
  attempted: boolean;
  reason?: string;
}

export async function runOcrViaApi(bytes: ArrayBuffer, fileName: string, language?: string): Promise<OcrResult> {
  const formData = new FormData();
  formData.append('file', new File([bytes], fileName, { type: 'application/pdf' }));
  formData.append('language', mapToTesseractLang(language));

  try {
    const response = await fetch(OCR_API_PATH, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      return {
        attempted: true,
        reason: summarizeError(response.status)
      };
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/pdf')) {
      return {
        attempted: true,
        reason: 'OCR response was not a PDF'
      };
    }

    const ocrBytes = await response.arrayBuffer();
    if (!ocrBytes.byteLength) {
      return {
        attempted: true,
        reason: 'OCR returned an empty PDF'
      };
    }

    return {
      attempted: true,
      bytes: ocrBytes
    };
  } catch (error) {
    return {
      attempted: true,
      reason: error instanceof Error ? error.message : 'Unknown OCR error'
    };
  }
}
