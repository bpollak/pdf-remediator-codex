import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ensurePdfJsWorkerConfigured } from './configure-worker';

export async function renderFirstPageToCanvas(bytes: ArrayBuffer, canvas: HTMLCanvasElement) {
  ensurePdfJsWorkerConfigured();
  const pdf = await getDocument({ data: bytes.slice(0) }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.25 });
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas context unavailable');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: context, viewport }).promise;
}
