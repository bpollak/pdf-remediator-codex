import type { AuditResult } from '@/lib/audit/types';
import type { ParsedPDF } from '@/lib/pdf/types';
import type { RemediationOptions } from '@/lib/remediate/engine';

// Keep the queue API stable while lazily loading the heavy PDF toolchain.
// This trims the initial /app bundle even before full worker orchestration lands.
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

  return result instanceof Uint8Array
    ? result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength)
    : result;
}
