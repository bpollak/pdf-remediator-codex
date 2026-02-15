import { getDocument } from 'pdfjs-dist';

export async function renderFirstPageToCanvas(bytes: ArrayBuffer, canvas: HTMLCanvasElement) {
  const pdf = await getDocument({ data: bytes }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.25 });
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas context unavailable');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: context, viewport }).promise;
}
