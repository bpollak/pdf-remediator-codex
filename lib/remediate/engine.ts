import type { ParsedPDF } from '@/lib/pdf/types';
import { buildRemediatedPdf } from './builder';
import type { VerapdfResult } from '@/lib/verapdf/types';

export interface RemediationOptions {
  addInvisibleTextLayer?: boolean;
  strictPdfUa?: boolean;
  verapdfFeedback?: VerapdfResult;
}

export async function remediatePdf(
  parsed: ParsedPDF,
  language = 'en-US',
  sourceBytes?: ArrayBuffer | Uint8Array,
  options?: RemediationOptions
) {
  return buildRemediatedPdf(parsed, language, sourceBytes, options);
}
