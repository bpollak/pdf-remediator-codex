import { getDocument } from 'pdfjs-dist';
import type { ParsedPDF } from './types';

export async function parsePdfBytes(bytes: ArrayBuffer): Promise<ParsedPDF> {
  const loadingTask = getDocument({ data: bytes });
  const doc = await loadingTask.promise;
  const metadataResult = await doc.getMetadata().catch(() => ({ info: {} as Record<string, unknown> }));
  const rawInfo = metadataResult.info;
  const metadata: Record<string, string | undefined> =
    rawInfo && typeof rawInfo === 'object'
      ? Object.fromEntries(
          Object.entries(rawInfo as Record<string, unknown>).map(([key, value]) => [
            key,
            typeof value === 'string' ? value : value == null ? undefined : String(value)
          ])
        )
      : {};

  return {
    pageCount: doc.numPages,
    metadata,
    language: metadata.Language,
    title: metadata.Title,
    hasStructTree: false,
    tags: [],
    textItems: [],
    images: [],
    links: [],
    outlines: [],
    forms: []
  };
}
