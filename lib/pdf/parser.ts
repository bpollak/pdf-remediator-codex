import { getDocument } from 'pdfjs-dist';
import { ensurePdfJsWorkerConfigured } from './configure-worker';
import type { ParsedPDF } from './types';

export async function parsePdfBytes(bytes: ArrayBuffer): Promise<ParsedPDF> {
  ensurePdfJsWorkerConfigured();
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

  const textItems: ParsedPDF['textItems'] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();

    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) {
        continue;
      }

      const transform = item.transform;
      const fontSize = Math.max(8, Math.abs(transform[0]) || Math.abs(transform[3]) || 12);

      textItems.push({
        text: item.str,
        x: transform[4],
        y: transform[5],
        width: Math.max(1, item.width || 1),
        height: Math.max(1, item.height || fontSize),
        fontName: item.fontName ?? 'Helvetica',
        fontSize,
        page: pageNumber
      });
    }
  }

  return {
    pageCount: doc.numPages,
    metadata,
    language: metadata.Language,
    title: metadata.Title,
    hasStructTree: false,
    tags: [],
    textItems,
    images: [],
    links: [],
    outlines: [],
    forms: []
  };
}
