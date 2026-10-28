import type { PDFDocument } from 'pdf-lib';

/**
 * Message for PDFs that carry an /Encrypt dictionary. pdf-lib can open
 * owner-password-only (permissions-restricted) files with ignoreEncryption,
 * but it cannot decrypt strings or streams, so anything written back would
 * mix encrypted and plain objects and come out broken.
 */
export const ENCRYPTED_PDF_MESSAGE =
  'This PDF is encrypted with security restrictions (a permissions password), so it cannot be remediated safely. ' +
  'Open it in Acrobat or another PDF editor, save a copy with security set to "No Security", and upload that copy.';

export class EncryptedPdfError extends Error {
  constructor(message = ENCRYPTED_PDF_MESSAGE) {
    super(message);
    this.name = 'EncryptedPdfError';
  }
}

export function assertNotEncrypted(pdf: PDFDocument): void {
  if (pdf.isEncrypted) throw new EncryptedPdfError();
}
