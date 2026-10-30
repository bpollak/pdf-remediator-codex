import { OcrStructureError, OcrTextLimitError } from '@/lib/pdf/pdf-errors';
import { describe, expect, it } from 'vitest';
import { StepTimeoutError } from '@/lib/client/deadline';
import {
  ProcessingFailureError,
  describeProcessingFailure,
  isRetryableErrorCode,
  redactConfigNames
} from '@/lib/client/error-copy';
import { EncryptedPdfError, ENCRYPTED_PDF_MESSAGE } from '@/lib/pdf/encryption';

describe('plain-language processing errors', () => {
  it('never shows configuration names, even in support details', () => {
    expect(
      redactConfigNames('Page 1: TritonAI OCR is not configured (set OCR_LITELLM_API_KEY or LITELLM_API_KEY).')
    ).toBe('Page 1: TritonAI OCR is not configured.');
    expect(redactConfigNames('Check VERAPDF_SERVICE_URL now')).toBe('Check [setting] now');
  });

  it('maps unreadable PDFs to actionable copy and keeps the raw message as detail', () => {
    const failure = describeProcessingFailure(new Error('Invalid PDF structure.'));
    expect(failure.code).toBe('unreadable');
    expect(failure.message).toMatch(/Re-export it from its source document/);
    expect(failure.detail).toBe('Invalid PDF structure.');
    expect(isRetryableErrorCode(failure.code)).toBe(false);
  });

  it('keeps the encrypted-PDF guidance', () => {
    expect(describeProcessingFailure(new EncryptedPdfError())).toMatchObject({
      code: 'password_protected',
      message: ENCRYPTED_PDF_MESSAGE
    });
  });

  it('passes the signed-PDF refusal through unchanged (matched by class, not text)', () => {
    class SignedPdfError extends Error {
      constructor() {
        super('This PDF is digitally signed. Changing it would invalidate the signature, so remove the signature first.');
        this.name = 'SignedPdfError';
      }
    }
    const failure = describeProcessingFailure(new SignedPdfError());
    expect(failure.code).toBe('signed');
    expect(failure.message).toMatch(/^This PDF is digitally signed/);
    expect(isRetryableErrorCode(failure.code)).toBe(false);
  });

  it('offers Try again for timeouts and unknown failures, without telling users to upload again', () => {
    const timeout = describeProcessingFailure(new StepTimeoutError('Reading the PDF', 300_000));
    expect(timeout.code).toBe('timed_out');
    expect(isRetryableErrorCode(timeout.code)).toBe(true);

    const unknown = describeProcessingFailure(new Error('x is undefined'));
    expect(unknown.message).toMatch(/Try again/);
    expect(unknown.message).not.toMatch(/upload/i);
  });

  it('passes through failures that already carry user-facing copy', () => {
    const failure = { code: 'too_many_pages' as const, message: 'Too many pages.' };
    expect(describeProcessingFailure(new ProcessingFailureError(failure))).toBe(failure);
    expect(isRetryableErrorCode('too_many_pages')).toBe(false);
  });
});

 it.each([new OcrStructureError(), new OcrTextLimitError()])('shows actionable OCR refusal guidance', (error) => {
  const failure = describeProcessingFailure(error);
  expect(failure.message).toBe(error.message);
  expect(failure.message).toContain('Acrobat');
  expect(isRetryableErrorCode(failure.code)).toBe(false);
 });
