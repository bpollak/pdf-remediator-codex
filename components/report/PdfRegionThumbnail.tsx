'use client';

import { useEffect, useRef, useState } from 'react';
import { renderPdfRegionToCanvas } from '@/lib/pdf/renderer';

export function PdfRegionThumbnail({
  bytes,
  page,
  bounds,
  label
}: {
  bytes?: ArrayBuffer;
  page: number;
  bounds: { x: number; y: number; width: number; height: number };
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<'idle' | 'ready' | 'error'>('idle');
  // Depend on the numbers, not the object: callers build a new bounds object
  // on every render, which used to re-render every thumbnail per keystroke.
  const { x, y, width, height } = bounds;

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;

    if (!bytes || !canvas) {
      setStatus('error');
      return () => {
        cancelled = true;
      };
    }

    setStatus('idle');
    renderPdfRegionToCanvas({
      bytes,
      pageNumber: page,
      bounds: { x, y, width, height },
      canvas
    })
      .then(() => {
        if (!cancelled) setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [bytes, page, x, y, width, height]);

  return (
    <div className="overflow-hidden rounded border border-[rgba(24,43,73,0.15)] bg-slate-50">
      <canvas ref={canvasRef} role="img" aria-label={`${label} thumbnail`} className="block h-auto w-full" />
      {status === 'error' ? (
        <p className="px-3 py-2 text-xs text-[var(--ucsd-text)]">Thumbnail unavailable for this image.</p>
      ) : null}
    </div>
  );
}
