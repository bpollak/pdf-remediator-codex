import { describe, expect, it } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ensurePdfJsWorkerConfigured } from '@/lib/pdf/configure-worker';
import {
  cachedPdfDocumentCount,
  clearPdfDocumentCache,
  pdfRectToViewportRect,
  renderFirstPageToCanvas
} from '@/lib/pdf/renderer';
import { ocrLineToTextItem } from '@/lib/ocr/local';
import { runAudit } from '@/lib/audit/engine';
import type { ParsedPDF } from '@/lib/pdf/types';

async function pageViewport(options: { rotate?: number; mediaBox?: [number, number, number, number] }, scale = 2) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  if (options.mediaBox) page.setMediaBox(...options.mediaBox);
  if (options.rotate) page.setRotation(degrees(options.rotate));
  const bytes = await doc.save();
  ensurePdfJsWorkerConfigured();
  const task = getDocument({ data: bytes });
  const pdf = await task.promise;
  const pdfPage = await pdf.getPage(1);
  const viewport = pdfPage.getViewport({ scale });
  return { viewport, close: () => task.destroy() };
}

describe('renderer crop geometry', () => {
  it('maps PDF rectangles on an unrotated page at the origin', async () => {
    const { viewport, close } = await pageViewport({});
    expect(pdfRectToViewportRect(viewport, { x: 100, y: 600, width: 50, height: 40 })).toEqual({
      x: 200,
      y: (792 - 640) * 2,
      width: 100,
      height: 80
    });
    await close();
  });

  it('accounts for a MediaBox that does not start at 0,0', async () => {
    const { viewport, close } = await pageViewport({ mediaBox: [100, 50, 612, 792] });
    // MediaBox origin (100,50): the point (100,50) is the bottom-left pixel.
    const crop = pdfRectToViewportRect(viewport, { x: 100, y: 50, width: 50, height: 40 });
    expect(crop.x).toBeCloseTo(0);
    expect(crop.y).toBeCloseTo(viewport.height - 80);
    expect(crop.width).toBeCloseTo(100);
    expect(crop.height).toBeCloseTo(80);
    await close();
  });

  it('accounts for /Rotate 90', async () => {
    const { viewport, close } = await pageViewport({ rotate: 90 });
    expect(viewport.width).toBeCloseTo(792 * 2);
    // Rotated clockwise: PDF bottom-left (0,0) lands at the top-left on screen.
    const crop = pdfRectToViewportRect(viewport, { x: 0, y: 0, width: 50, height: 40 });
    expect(crop).toEqual({ x: 0, y: 0, width: 80, height: 100 });
    await close();
  });
});

describe('local OCR geometry', () => {
  it('converts canvas boxes to PDF user space on offset and rotated pages', async () => {
    const offset = await pageViewport({ mediaBox: [100, 50, 612, 792] }, 1.6);
    const item = ocrLineToTextItem(
      { text: 'Hello world', confidence: 90, bbox: { x0: 16, y0: offset.viewport.height - 32, x1: 176, y1: offset.viewport.height - 16 } },
      1,
      offset.viewport
    )!;
    expect(item.x).toBeCloseTo(110);
    expect(item.y).toBeCloseTo(60);
    expect(item.width).toBeCloseTo(100);
    expect(item.height).toBeCloseTo(10);
    await offset.close();

    const rotated = await pageViewport({ rotate: 90 }, 1);
    // A line drawn across the top-left of the rotated view starts near PDF (0,0)
    // and runs up the page's y axis.
    const rotatedItem = ocrLineToTextItem({ text: 'Rotated', bbox: { x0: 0, y0: 0, x1: 100, y1: 12 } }, 1, rotated.viewport)!;
    expect(rotatedItem.x).toBeCloseTo(12);
    expect(rotatedItem.y).toBeCloseTo(0);
    expect(rotatedItem.width).toBeCloseTo(100);
    expect(rotatedItem.height).toBeCloseTo(12);
    await rotated.close();
  });
});

describe('renderer document cache', () => {
  function fakeCanvas() {
    return { getContext: () => null, width: 0, height: 0 } as unknown as HTMLCanvasElement;
  }

  it('keeps at most three documents and never caches a failed load', async () => {
    clearPdfDocumentCache();
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const bytes = await doc.save();

    for (let index = 0; index < 5; index += 1) {
      const buffer = bytes.slice().buffer as ArrayBuffer;
      await expect(renderFirstPageToCanvas(buffer, fakeCanvas())).rejects.toThrow(/Canvas context unavailable/);
    }
    expect(cachedPdfDocumentCount()).toBe(3);

    clearPdfDocumentCache();
    const broken = new TextEncoder().encode('not a pdf').buffer as ArrayBuffer;
    await expect(renderFirstPageToCanvas(broken, fakeCanvas())).rejects.toThrow();
    expect(cachedPdfDocumentCount()).toBe(0);
  });
});

describe('CLR-001 without color data', () => {
  it('is reported as not checked instead of passing', () => {
    const parsed: ParsedPDF = {
      pageCount: 1,
      metadata: {},
      hasStructTree: false,
      tags: [],
      textItems: [{ text: 'Plain text', x: 0, y: 0, width: 10, height: 10, fontName: 'Helvetica', fontSize: 12, page: 1 }],
      images: [],
      links: [],
      outlines: [],
      forms: []
    };
    const audit = runAudit(parsed);
    expect(audit.notChecked).toContain('CLR-001');
    expect(audit.findings.some((finding) => finding.ruleId === 'CLR-001')).toBe(false);

    const colored = runAudit({ ...parsed, textItems: [{ ...parsed.textItems[0]!, color: '#cccccc' }] });
    expect(colored.notChecked ?? []).not.toContain('CLR-001');
    expect(colored.findings.some((finding) => finding.ruleId === 'CLR-001')).toBe(true);
  });
});
