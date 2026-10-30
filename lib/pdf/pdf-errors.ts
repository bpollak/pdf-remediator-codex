// Refusal messages and error classes, kept free of pdf-lib so the upload
// page can recognise them without loading the PDF toolchain.

/**
 * Message for PDFs that carry an /Encrypt dictionary. pdf-lib can open
 * owner-password-only (permissions-restricted) files with ignoreEncryption,
 * but it cannot decrypt strings or streams, so anything written back would
 * mix encrypted and plain objects and come out broken.
 */
export const ENCRYPTED_PDF_MESSAGE =
  'This PDF is encrypted with security restrictions (a permissions password), so it cannot be remediated safely. ' +
  'Open it in Acrobat or another PDF editor, save a copy with security set to "No Security", and upload that copy.';

/**
 * Message for digitally signed PDFs. Any rewrite of the file (even a
 * metadata change) breaks the signature, so the file is refused instead.
 */
export const SIGNED_PDF_MESSAGE =
  'This PDF is digitally signed. Changing it would invalidate the signature. ' +
  'Remove the signature or work from the unsigned original.';

export class EncryptedPdfError extends Error {
  constructor(message = ENCRYPTED_PDF_MESSAGE) {
    super(message);
    this.name = 'EncryptedPdfError';
  }
}

export class SignedPdfError extends Error {
  constructor(message = SIGNED_PDF_MESSAGE) {
    super(message);
    this.name = 'SignedPdfError';
  }
}

export class OcrStructureError extends Error {
  constructor() {
    super('OCR could not safely extend this PDF’s existing tags. The original PDF is unchanged. Run OCR in Acrobat and upload that copy.');
    this.name = 'OcrStructureError';
  }
}

export class OcrTextLimitError extends Error {
  constructor() {
    super('This OCR text exceeds the safe document limit. Run OCR in Acrobat and upload that copy.');
    this.name = 'OcrTextLimitError';
  }
}
