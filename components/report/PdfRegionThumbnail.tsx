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
      bounds,
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
  }, [bounds, bytes, page]);

  return (
    <div className="overflow-hidden rounded border border-[rgba(24,43,73,0.15)] bg-slate-50">
      <canvas ref={canvasRef} aria-label={`${label} thumbnail`} className="block h-auto w-full" />
      {status === 'error' ? (
        <p className="px-3 py-2 text-xs text-[var(--ucsd-text)]">Thumbnail unavailable for this image.</p>
      ) : null}
    </div>
  );
}
