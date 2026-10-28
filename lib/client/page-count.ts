import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ensurePdfJsWorkerConfigured } from '@/lib/pdf/configure-worker';

/**
 * Read the page count without the full parse: pdf.js only loads the
 * cross-reference table and page tree. Rejects for unreadable files; callers
 * should fall through to the full parse, which produces the real error.
 * Import this lazily: it pulls in pdf.js.
 */
export async function readPdfPageCount(bytes: ArrayBuffer): Promise<number> {
  ensurePdfJsWorkerConfigured();
  const loadingTask = getDocument({ data: bytes.slice(0) });
  try {
    const doc = await loadingTask.promise;
    return doc.numPages;
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}
