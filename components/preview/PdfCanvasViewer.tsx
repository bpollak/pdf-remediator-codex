'use client';

import { useEffect, useRef, useState } from 'react';
import { ensurePdfJsWorkerConfigured } from '@/lib/pdf/configure-worker';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDocProxy = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfjsModule = any;

/**
 * A single PDF page: renders canvas + text layer for selectable text.
 * Receives the already-loaded PDF document to avoid redundant loads.
 */
function PdfPage({
  pdfDoc,
  pdfjs,
  pageNumber
}: {
  pdfDoc: PdfDocProxy;
  pdfjs: PdfjsModule;
  pageNumber: number;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(200);
  const [status, setStatus] = useState<'idle' | 'done' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const wrapper = wrapperRef.current;
        const canvas = canvasRef.current;
        const textLayerDiv = textLayerRef.current;
        if (!wrapper || !canvas || !textLayerDiv) return;

        // Wait for layout if needed
        let containerWidth = wrapper.clientWidth;
        if (containerWidth <= 0) {
          await new Promise<void>((resolve) => {
            const ro = new ResizeObserver((entries) => {
              const w = entries[0]?.contentRect?.width ?? 0;
              if (w > 0) {
                containerWidth = w;
                ro.disconnect();
                resolve();
              }
            });
            ro.observe(wrapper);
          });
        }

        if (cancelled || containerWidth <= 0) return;

        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const dpr = window.devicePixelRatio || 1;
        const unscaledViewport = page.getViewport({ scale: 1 });
        const displayScale = containerWidth / unscaledViewport.width;
        const displayHeight = unscaledViewport.height * displayScale;
        setHeight(displayHeight);

        // Render canvas at high-res for sharp text
        const renderScale = displayScale * dpr;
        const viewport = page.getViewport({ scale: renderScale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        if (!context) return;
        await page.render({ canvasContext: context, viewport }).promise;

        if (cancelled) return;

        // Render selectable text layer
        const displayViewport = page.getViewport({ scale: displayScale });
        const textContent = await page.getTextContent();
        if (cancelled) return;

        textLayerDiv.innerHTML = '';
        const textLayer = new pdfjs.TextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport: displayViewport
        });
        await textLayer.render();

        if (!cancelled) setStatus('done');
      } catch (err) {
        console.error(`Error rendering page ${pageNumber}:`, err);
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pdfjs, pageNumber]);

  return (
    <div
      ref={wrapperRef}
      data-page={pageNumber}
      className="relative w-full border-b border-[rgba(24,43,73,0.1)] last:border-b-0"
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
      />
      <div
        ref={textLayerRef}
        className="textLayer absolute inset-0"
      />
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-red-600">
          Failed to render page {pageNumber}
        </div>
      )}
    </div>
  );
}

/**
 * Renders all pages of a PDF with canvas + text layer overlay.
 * Text is selectable, matching the actual PDF content (including OCR text).
 * Loads the PDF document once and shares it across all page components.
 */
export function PdfCanvasViewer({
  bytes,
  focusPage,
  className
}: {
  bytes: ArrayBuffer;
  focusPage?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfDocProxy | null>(null);
  const [pdfjs, setPdfjs] = useState<PdfjsModule | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load PDF document once
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        ensurePdfJsWorkerConfigured();
        const mod = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const pdf = await mod.getDocument({ data: bytes.slice(0) }).promise;
        if (!cancelled) {
          setPdfjs(mod);
          setPdfDoc(pdf);
        }
      } catch (err) {
        console.error('PDF load error:', err);
        if (!cancelled) setError('Failed to load PDF preview.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bytes]);

  // Scroll to focused page
  useEffect(() => {
    if (!focusPage || !containerRef.current || !pdfDoc) return;
    const target = containerRef.current.querySelector(`[data-page="${focusPage}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [focusPage, pdfDoc]);

  if (error) {
    return (
      <div className={`flex items-center justify-center rounded border border-[rgba(24,43,73,0.2)] bg-slate-50 p-8 text-sm text-[var(--ucsd-text)] ${className ?? ''}`}>
        {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-y-auto rounded border border-[rgba(24,43,73,0.2)] bg-gray-100 ${className ?? ''}`}
    >
      {!pdfDoc && (
        <div className="flex items-center justify-center p-8 text-sm text-[var(--ucsd-text)]">
          Loading PDF preview…
        </div>
      )}
      {pdfDoc && pdfjs && Array.from({ length: pdfDoc.numPages }, (_, i) => (
        <PdfPage key={i + 1} pdfDoc={pdfDoc} pdfjs={pdfjs} pageNumber={i + 1} />
      ))}
    </div>
  );
}
