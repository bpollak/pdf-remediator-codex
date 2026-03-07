import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ensurePdfJsWorkerConfigured } from './configure-worker';

const documentCache = new WeakMap<ArrayBuffer, Promise<any>>();

async function getPdfDocument(bytes: ArrayBuffer) {
  const cached = documentCache.get(bytes);
  if (cached) return cached;

  ensurePdfJsWorkerConfigured();
  const next = getDocument({ data: bytes.slice(0) }).promise;
  documentCache.set(bytes, next);
  return next;
}

export async function renderFirstPageToCanvas(bytes: ArrayBuffer, canvas: HTMLCanvasElement) {
  const pdf = await getPdfDocument(bytes);
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.25 });
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas context unavailable');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: context, viewport }).promise;
}

export async function renderPdfRegionToCanvas(input: {
  bytes: ArrayBuffer;
  pageNumber: number;
  bounds: { x: number; y: number; width: number; height: number };
  canvas: HTMLCanvasElement;
  maxWidth?: number;
  maxHeight?: number;
}) {
  const { bytes, pageNumber, bounds, canvas, maxWidth = 220, maxHeight = 160 } = input;
  const pdf = await getPdfDocument(bytes);
  const page = await pdf.getPage(pageNumber);
  const scale = 1.75;
  const viewport = page.getViewport({ scale });
  const sourceCanvas = document.createElement('canvas');
  const sourceContext = sourceCanvas.getContext('2d');
  if (!sourceContext) throw new Error('Canvas context unavailable');

  sourceCanvas.width = viewport.width;
  sourceCanvas.height = viewport.height;
  await page.render({ canvasContext: sourceContext, viewport }).promise;

  const cropX = Math.max(0, bounds.x * scale);
  const cropY = Math.max(0, viewport.height - (bounds.y + bounds.height) * scale);
  const cropWidth = Math.max(1, bounds.width * scale);
  const cropHeight = Math.max(1, bounds.height * scale);
  const margin = Math.max(18, Math.min(cropWidth, cropHeight) * 0.3);
  const sx = Math.max(0, cropX - margin);
  const sy = Math.max(0, cropY - margin);
  const sw = Math.min(sourceCanvas.width - sx, cropWidth + margin * 2);
  const sh = Math.min(sourceCanvas.height - sy, cropHeight + margin * 2);

  const destinationContext = canvas.getContext('2d');
  if (!destinationContext) throw new Error('Canvas context unavailable');

  const ratio = Math.min(maxWidth / sw, maxHeight / sh, 1);
  const targetWidth = Math.max(1, Math.round(sw * ratio));
  const targetHeight = Math.max(1, Math.round(sh * ratio));
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  destinationContext.clearRect(0, 0, targetWidth, targetHeight);
  destinationContext.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);

  const highlightX = ((cropX - sx) / sw) * targetWidth;
  const highlightY = ((cropY - sy) / sh) * targetHeight;
  const highlightWidth = (cropWidth / sw) * targetWidth;
  const highlightHeight = (cropHeight / sh) * targetHeight;

  destinationContext.strokeStyle = '#00629b';
  destinationContext.lineWidth = 2;
  destinationContext.strokeRect(highlightX, highlightY, highlightWidth, highlightHeight);
}
