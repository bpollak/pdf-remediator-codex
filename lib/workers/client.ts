import type { AuditResult } from '@/lib/audit/types';
import type { ParsedPDF } from '@/lib/pdf/types';
import type { RemediationOptions } from '@/lib/remediate/engine';

// These run on the main thread; nothing here uses a Web Worker yet (pdf.js
// parses in its own worker, but pdf-lib remediation and the audit do not).
// The *InWorker names mark the seam where a real worker can be added without
// changing the queue. The dynamic imports keep the heavy PDF toolchain out of
// the initial /app bundle.
export async function parsePdfInWorker(_fileId: string, bytes: ArrayBuffer): Promise<ParsedPDF> {
  const { parsePdfBytes } = await import('@/lib/pdf/parser');
  return parsePdfBytes(bytes);
}

export async function runAuditInWorker(_fileId: string, parsed: ParsedPDF): Promise<AuditResult> {
  const { runAudit } = await import('@/lib/audit/engine');
  return runAudit(parsed);
}

export async function remediatePdfInWorker(input: {
  fileId: string;
  parsed: ParsedPDF;
  language?: string;
  sourceBytes?: ArrayBuffer;
  options?: RemediationOptions;
}): Promise<ArrayBuffer> {
  const { parsed, language, sourceBytes, options } = input;
  const { remediatePdf } = await import('@/lib/remediate/engine');
  const result = await remediatePdf(parsed, language, sourceBytes, options);

  if (result instanceof Uint8Array) {
    const bytes = new Uint8Array(result.byteLength);
    bytes.set(result);
    return bytes.buffer;
  }

  return result;
}
