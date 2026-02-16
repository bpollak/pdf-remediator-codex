import type { ParsedPDF } from '@/lib/pdf/types';
import { buildRemediatedPdf } from './builder';

export interface RemediationOptions {
  addInvisibleTextLayer?: boolean;
}

export async function remediatePdf(
  parsed: ParsedPDF,
  language = 'en-US',
  sourceBytes?: ArrayBuffer | Uint8Array,
  options?: RemediationOptions
) {
  return buildRemediatedPdf(parsed, language, sourceBytes, options);
}
