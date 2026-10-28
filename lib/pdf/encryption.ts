import { PDFArray, PDFDict, PDFName, type PDFDocument } from 'pdf-lib';

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

export function assertNotEncrypted(pdf: PDFDocument): void {
  if (pdf.isEncrypted) throw new EncryptedPdfError();
}

const MAX_SIGNATURE_FIELD_NODES = 10000;

function lookupDict(pdf: PDFDocument, value: unknown): PDFDict | undefined {
  if (!value) return undefined;
  if (value instanceof PDFDict) return value;
  try {
    const resolved = pdf.context.lookup(value as Parameters<typeof pdf.context.lookup>[0]);
    return resolved instanceof PDFDict ? resolved : undefined;
  } catch {
    return undefined;
  }
}

function lookupArray(pdf: PDFDocument, value: unknown): PDFArray | undefined {
  if (!value) return undefined;
  if (value instanceof PDFArray) return value;
  try {
    const resolved = pdf.context.lookup(value as Parameters<typeof pdf.context.lookup>[0]);
    return resolved instanceof PDFArray ? resolved : undefined;
  } catch {
    return undefined;
  }
}

/** True when a signature field (FT /Sig, possibly inherited) carries a value. */
function hasFilledSignatureField(pdf: PDFDocument, fields: PDFArray): boolean {
  const stack = fields.asArray().map((value) => ({ value: value as unknown, inheritedSig: false }));
  const visited = new Set<PDFDict>();

  while (stack.length > 0 && visited.size < MAX_SIGNATURE_FIELD_NODES) {
    const { value, inheritedSig } = stack.pop()!;
    const field = lookupDict(pdf, value);
    if (!field || visited.has(field)) continue;
    visited.add(field);

    const fieldType = field.get(PDFName.of('FT'));
    const isSig = fieldType instanceof PDFName ? fieldType.toString() === '/Sig' : inheritedSig;
    if (isSig && field.get(PDFName.of('V')) !== undefined) return true;

    const kids = lookupArray(pdf, field.get(PDFName.of('Kids')));
    if (!kids) continue;
    for (const kid of kids.asArray()) stack.push({ value: kid, inheritedSig: isSig });
  }

  return false;
}

/**
 * Digitally signed PDFs: a certification (DocMDP) or usage-rights (UR3)
 * signature in /Perms, or a filled signature field. /SigFlags alone is only
 * a hint (it is also set for empty signature fields), so a field with a
 * signature value is required.
 */
export function isDigitallySigned(pdf: PDFDocument): boolean {
  const perms = lookupDict(pdf, pdf.catalog.get(PDFName.of('Perms')));
  if (perms && (perms.has(PDFName.of('DocMDP')) || perms.has(PDFName.of('UR3')) || perms.has(PDFName.of('UR')))) {
    return true;
  }

  const acroForm = lookupDict(pdf, pdf.catalog.get(PDFName.of('AcroForm')));
  const fields = acroForm ? lookupArray(pdf, acroForm.get(PDFName.of('Fields'))) : undefined;
  return fields ? hasFilledSignatureField(pdf, fields) : false;
}

export function assertNotSigned(pdf: PDFDocument): void {
  if (isDigitallySigned(pdf)) throw new SignedPdfError();
}
