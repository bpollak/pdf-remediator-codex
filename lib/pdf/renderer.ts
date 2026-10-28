import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ensurePdfJsWorkerConfigured } from './configure-worker';

type PdfDocumentProxy = Awaited<ReturnType<typeof getDocument>['promise']>;

interface CachedDocument {
  promise: Promise<PdfDocumentProxy>;
  users: number;
  evicted: boolean;
}

/** Documents kept open for repeated thumbnail/preview renders. */
const MAX_CACHED_DOCUMENTS = 3;

// Map preserves insertion order; re-inserting on access makes it an LRU.
const documentCache = new Map<ArrayBuffer, CachedDocument>();

function destroyEntry(entry: CachedDocument) {
  entry.promise.then((doc) => doc.destroy()).catch(() => undefined);
}

function evictOverflow() {
  while (documentCache.size > MAX_CACHED_DOCUMENTS) {
    const oldestKey = documentCache.keys().next().value as ArrayBuffer | undefined;
    if (oldestKey === undefined) return;
    const entry = documentCache.get(oldestKey)!;
    documentCache.delete(oldestKey);
    entry.evicted = true;
    // A document still being rendered is destroyed when its last user releases it.
    if (entry.users === 0) destroyEntry(entry);
  }
}

function acquirePdfDocument(bytes: ArrayBuffer): CachedDocument {
  const cached = documentCache.get(bytes);
  if (cached) {
    documentCache.delete(bytes);
    documentCache.set(bytes, cached);
    cached.users += 1;
    return cached;
  }

  ensurePdfJsWorkerConfigured();
  const loadingTask = getDocument({ data: bytes.slice(0) });
  const entry: CachedDocument = { promise: loadingTask.promise, users: 1, evicted: false };
  entry.promise.catch(() => {
    // Never cache a failed load: drop it so the next call retries, and
    // release whatever the worker allocated.
    if (documentCache.get(bytes) === entry) documentCache.delete(bytes);
    entry.evicted = true;
    loadingTask.destroy().catch(() => undefined);
  });
  documentCache.set(bytes, entry);
  evictOverflow();
  return entry;
}

function releasePdfDocument(entry: CachedDocument) {
  entry.users = Math.max(0, entry.users - 1);
  if (entry.evicted && entry.users === 0) destroyEntry(entry);
}

async function withPdfDocument<T>(bytes: ArrayBuffer, render: (doc: PdfDocumentProxy) => Promise<T>): Promise<T> {
  const entry = acquirePdfDocument(bytes);
  try {
    return await render(await entry.promise);
  } finally {
    releasePdfDocument(entry);
  }
}

/** Test hook: number of documents currently cached. */
export function cachedPdfDocumentCount(): number {
  return documentCache.size;
}

/** Test hook: destroy and forget every cached document. */
export function clearPdfDocumentCache(): void {
  for (const entry of documentCache.values()) {
    entry.evicted = true;
    if (entry.users === 0) destroyEntry(entry);
  }
  documentCache.clear();
}

interface ViewportLike {
  width: number;
  height: number;
  convertToViewportRectangle: (rect: number[]) => number[];
}

/**
 * Maps a rectangle in PDF user space (as reported by the parser: x/y are
 * the lower-left corner) to canvas pixels for this viewport. Uses the
 * viewport transform, so /Rotate and a MediaBox that does not start at
 * 0,0 are handled.
 */
export function pdfRectToViewportRect(
  viewport: ViewportLike,
  bounds: { x: number; y: number; width: number; height: number }
): { x: number; y: number; width: number; height: number } {
  const [x1, y1, x2, y2] = viewport.convertToViewportRectangle([
    bounds.x,
    bounds.y,
    bounds.x + bounds.width,
    bounds.y + bounds.height
  ]) as [number, number, number, number];
  const left = Math.max(0, Math.min(x1, x2));
  const top = Math.max(0, Math.min(y1, y2));
  const right = Math.min(viewport.width, Math.max(x1, x2));
  const bottom = Math.min(viewport.height, Math.max(y1, y2));
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

export async function renderFirstPageToCanvas(bytes: ArrayBuffer, canvas: HTMLCanvasElement) {
  await withPdfDocument(bytes, async (pdf) => {
    const page = await pdf.getPage(1);
    try {
      const viewport = page.getViewport({ scale: 1.25 });
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas context unavailable');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport }).promise;
    } finally {
      page.cleanup();
    }
  });
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

  await withPdfDocument(bytes, async (pdf) => {
    const page = await pdf.getPage(pageNumber);
    const sourceCanvas = document.createElement('canvas');

    try {
      const scale = 1.75;
      const viewport = page.getViewport({ scale });
      const sourceContext = sourceCanvas.getContext('2d');
      if (!sourceContext) throw new Error('Canvas context unavailable');

      sourceCanvas.width = viewport.width;
      sourceCanvas.height = viewport.height;
      await page.render({ canvasContext: sourceContext, viewport }).promise;

      const crop = pdfRectToViewportRect(viewport, bounds);
      const cropX = crop.x;
      const cropY = crop.y;
      const cropWidth = crop.width;
      const cropHeight = crop.height;
      const margin = Math.max(18, Math.min(cropWidth, cropHeight) * 0.3);
      const sx = Math.max(0, cropX - margin);
      const sy = Math.max(0, cropY - margin);
      const sw = Math.max(1, Math.min(sourceCanvas.width - sx, cropWidth + margin * 2));
      const sh = Math.max(1, Math.min(sourceCanvas.height - sy, cropHeight + margin * 2));

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
    } finally {
      sourceCanvas.width = 0;
      sourceCanvas.height = 0;
      page.cleanup();
    }
  });
}

export async function renderPdfRegionToDataUrl(input: {
  bytes: ArrayBuffer;
  pageNumber: number;
  bounds: { x: number; y: number; width: number; height: number };
  maxWidth?: number;
  maxHeight?: number;
}): Promise<string> {
  const canvas = document.createElement('canvas');
  await renderPdfRegionToCanvas({
    ...input,
    canvas,
    maxWidth: input.maxWidth ?? 640,
    maxHeight: input.maxHeight ?? 640
  });
  return canvas.toDataURL('image/png');
}
