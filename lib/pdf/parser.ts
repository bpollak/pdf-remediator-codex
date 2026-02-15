import { getDocument } from 'pdfjs-dist';
import type { ParsedPDF } from './types';

export async function parsePdfBytes(bytes: ArrayBuffer): Promise<ParsedPDF> {
  const loadingTask = getDocument({ data: bytes });
  const doc = await loadingTask.promise;
  const metadataResult = await doc.getMetadata().catch(() => ({ info: {} as Record<string, string> }));

  return {
    pageCount: doc.numPages,
    metadata: metadataResult.info,
    language: metadataResult.info.Language,
    title: metadataResult.info.Title,
    hasStructTree: false,
    tags: [],
    textItems: [],
    images: [],
    links: [],
    outlines: [],
    forms: []
  };
}
