import { StepTimeoutError, isAbortError } from '@/lib/client/deadline';
import { ENCRYPTED_PDF_MESSAGE, EncryptedPdfError } from '@/lib/pdf/encryption';
import type { ProcessingErrorCode } from '@/types/file-entry';

export const INTERRUPTED_MESSAGE =
  'Processing was interrupted (the browser tab may have run out of memory). Try again, or split the PDF into smaller files.';

export const SCANNED_TEXT_UNREADABLE_MESSAGE =
  "We couldn't read the text in this scanned PDF. In Acrobat, run Scan & OCR > Recognize text, or rescan as a searchable PDF, then upload it again.";

export function tooManyPagesMessage(pageCount: number, maxPages: number): string {
  return `This PDF has ${pageCount} pages. The browser tool handles up to ${maxPages}; split it into smaller files.`;
}

/**
 * Remove configuration names (environment variables such as OCR_LITELLM_API_KEY)
 * and "set ..." hints from diagnostics before they are shown, even to support.
 */
export function redactConfigNames(text: string): string {
  return text
    .replace(/\s*\((?:set|configure)\s[^)]*\)/gi, '')
    .replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, '[setting]')
    .trim();
}

export interface ProcessingFailure {
  code: ProcessingErrorCode;
  /** Short, actionable copy for the file card. */
  message: string;
  /** Raw diagnostic for "Details for support". */
  detail?: string;
}

/** Codes where Try again can't help: the file itself has to change. */
const NOT_RETRYABLE = new Set<ProcessingErrorCode>(['too_many_pages', 'password_protected', 'signed', 'unreadable']);

export function isRetryableErrorCode(code: ProcessingErrorCode | undefined): boolean {
  return !code || !NOT_RETRYABLE.has(code);
}

/** Thrown for failures whose copy is already user-facing. */
export class ProcessingFailureError extends Error {
  constructor(readonly failure: ProcessingFailure) {
    super(failure.message);
    this.name = 'ProcessingFailureError';
  }
}

export function describeProcessingFailure(error: unknown): ProcessingFailure {
  if (error instanceof ProcessingFailureError) return error.failure;

  const name = error instanceof Error ? error.name : '';
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const detail = raw ? redactConfigNames(raw) : undefined;

  if (error instanceof StepTimeoutError || name === 'TimeoutError') {
    return {
      code: 'timed_out',
      message: 'This PDF took too long to process, so we stopped. Try again. If it keeps happening, split the PDF into smaller files.',
      detail
    };
  }
  if (isAbortError(error)) {
    return { code: 'failed', message: 'Processing was stopped. Try again.', detail };
  }
  // The engine's own refusals (lib/pdf/encryption.ts) are already written for
  // users. Match on the error class, not the text: the signed-PDF message
  // contains "invalidate", which the unreadable check below would catch.
  if (error instanceof EncryptedPdfError || name === 'EncryptedPdfError') {
    return { code: 'password_protected', message: raw || ENCRYPTED_PDF_MESSAGE };
  }
  if (name === 'SignedPdfError') {
    return { code: 'signed', message: raw };
  }
  if (name === 'PasswordException' || /password|encrypt/i.test(raw)) {
    return {
      code: 'password_protected',
      message: 'This PDF is password-protected. Remove the password protection, then upload it again.',
      detail
    };
  }
  if (name === 'InvalidPDFException' || /invalid|corrupt|malformed|unexpected|parse/i.test(raw)) {
    return {
      code: 'unreadable',
      message:
        "We couldn't read this PDF; it may be damaged. Re-export it from its source document (for example Word or PowerPoint), then upload it again.",
      detail
    };
  }
  if (/memory|allocation|out of range/i.test(raw)) {
    return {
      code: 'failed',
      message: 'This PDF is too large to process in this browser tab. Split it into smaller files, then upload them.',
      detail
    };
  }
  return {
    code: 'failed',
    message: 'Something went wrong while processing this PDF. Try again. If it keeps failing, re-export the PDF from its source document.',
    detail
  };
}
