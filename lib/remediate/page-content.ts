import { PDFArray, PDFContentStream, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { bytesToBinaryString } from './pdf-text';

type PdfPage = ReturnType<PDFDocument['getPages']>[number];

/**
 * Decodes a page's content streams into one binary string (one char per
 * byte, streams joined by a newline). Returns undefined when a stream is
 * missing or uses a filter pdf-lib cannot decode.
 */
export function decodePageContent(pdf: PDFDocument, page: PdfPage): string | undefined {
  const contents = page.node.get(PDFName.of('Contents'));
  const streams: Array<PDFRawStream | PDFContentStream> = [];

  const collect = (value: unknown): boolean => {
    try {
      const resolved =
        value instanceof PDFRawStream || value instanceof PDFContentStream
          ? value
          : pdf.context.lookup(value as Parameters<typeof pdf.context.lookup>[0]);
      // PDFContentStream: operators pdf-lib added in this session (e.g. the
      // q/Q wrappers page normalization inserts).
      if (resolved instanceof PDFRawStream || resolved instanceof PDFContentStream) {
        streams.push(resolved);
        return true;
      }
      if (resolved instanceof PDFArray) {
        for (let i = 0; i < resolved.size(); i += 1) {
          if (!collect(resolved.get(i))) return false;
        }
        return true;
      }
    } catch {
      return false;
    }
    return false;
  };

  if (!contents || !collect(contents)) return undefined;
  if (streams.length === 0) return undefined;

  // Content streams are binary: keep a strict 1:1 byte<->char mapping so
  // string operands and inline image data survive a rewrite untouched.
  const parts: string[] = [];
  for (const stream of streams) {
    try {
      const bytes = stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getUnencodedContents();
      parts.push(bytesToBinaryString(bytes));
    } catch {
      return undefined;
    }
  }
  return parts.join('\n');
}

/** Highest /MCID used in decoded content, or -1. */
export function maxMcidInContent(content: string): number {
  let max = -1;
  const mcidPattern = /\/MCID\s+(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = mcidPattern.exec(content))) {
    max = Math.max(max, Number(match[1]));
  }
  return max;
}
