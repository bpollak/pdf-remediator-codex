import { PDFHexString, PDFString } from 'pdf-lib';

/**
 * Encodes a JavaScript string as a PDF text string.
 *
 * pdf-lib's PDFString.of() writes the value verbatim between parentheses:
 * it neither escapes `(`, `)` or `\` nor encodes characters outside
 * Latin-1 (only the low byte of each UTF-16 code unit survives). Plain
 * printable ASCII without delimiters is safe as a literal string; anything
 * else is written as a UTF-16BE hex string with a byte order mark.
 */
export function encodePdfTextString(value: string): PDFString | PDFHexString {
  if (/^[\x20-\x7e]*$/.test(value) && !/[()\\]/.test(value)) {
    return PDFString.of(value);
  }
  return PDFHexString.fromText(value);
}

/**
 * Maps bytes to a string with exactly one char per byte (char code ===
 * byte value). Unlike TextDecoder('latin1'), which is windows-1252 and
 * remaps 0x80–0x9F, this round-trips every byte through binaryStringToBytes.
 */
export function bytesToBinaryString(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let result = '';
  for (let index = 0; index < bytes.length; index += CHUNK) {
    result += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return result;
}

/** Inverse of bytesToBinaryString. Throws on chars that are not single bytes. */
export function binaryStringToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code > 0xff) throw new Error(`Non-byte character at offset ${index} in PDF content.`);
    bytes[index] = code;
  }
  return bytes;
}
