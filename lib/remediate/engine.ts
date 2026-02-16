import type { ParsedPDF } from '@/lib/pdf/types';
import { buildRemediatedPdf } from './builder';

export async function remediatePdf(parsed: ParsedPDF, language = 'en-US', sourceBytes?: ArrayBuffer | Uint8Array) {
  return buildRemediatedPdf(parsed, language, sourceBytes);
}
