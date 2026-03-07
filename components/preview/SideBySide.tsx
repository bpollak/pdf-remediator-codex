'use client';

import { useEffect, useMemo, useState } from 'react';
import { PdfRegionThumbnail } from '@/components/report/PdfRegionThumbnail';
import { computeDisplayedAutomatedScore } from '@/lib/report/display-score';
import { useAppStore } from '@/stores/app-store';

type PreviewVariant = 'original' | 'remediated';

function formatBytes(byteLength: number): string {
  if (byteLength < 1024) return `${byteLength} B`;
  if (byteLength < 1024 * 1024) return `${(byteLength / 1024).toFixed(1)} KB`;
  return `${(byteLength / (1024 * 1024)).toFixed(2)} MB`;
}

function scoreValue(score: number | undefined): string {
  return typeof score === 'number' ? `${score}%` : 'Unavailable';
}

function scoreTone(score: number | undefined): string {
  if (typeof score !== 'number') return 'text-gray-500';
  if (score >= 90) return 'text-green-700';
  if (score >= 70) return 'text-[var(--ucsd-blue)]';
  if (score >= 40) return 'text-amber-700';
  return 'text-red-700';
}

function useBlobUrl(bytes?: ArrayBuffer) {
  return useMemo(() => {
    if (!bytes) return null;
    return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  }, [bytes]);
}

function DocumentSelectorCard({
  title,
  score,
  bytes,
  active,
  onSelect
}: {
  title: string;
  score?: number;
  bytes?: ArrayBuffer;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      className={`rounded border p-3 shadow-sm transition ${
        active ? 'border-[var(--ucsd-blue)] bg-[rgba(0,98,155,0.06)]' : 'border-[rgba(24,43,73,0.15)] bg-white'
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ucsd-text)]">{title}</p>
      <p className={`mt-2 text-2xl font-bold ${scoreTone(score)}`}>{scoreValue(score)}</p>
      <p className="mt-1 text-sm text-[var(--ucsd-text)]">
        {bytes ? `File size: ${formatBytes(bytes.byteLength)}` : 'Preview unavailable in this browser session.'}
      </p>
      <button
        type="button"
        onClick={onSelect}
        className={`mt-3 inline-flex items-center rounded-md px-3 py-2 text-sm font-medium transition ${
          active
            ? 'bg-[var(--ucsd-blue)] text-white hover:bg-[var(--ucsd-navy)]'
            : 'border border-[rgba(24,43,73,0.25)] text-[var(--ucsd-text)] hover:bg-slate-50'
        }`}
      >
        {active ? 'Viewing this document' : 'Review this document'}
      </button>
    </article>
  );
}

export function SideBySide({ fileId }: { fileId: string }) {
  const file = useAppStore((state) => state.files.find((entry) => entry.id === fileId));
  const previewFocus = useAppStore((state) => state.previewFocusByFileId[fileId]);
  const setPreviewFocus = useAppStore((state) => state.setPreviewFocus);
  const [selectedVariant, setSelectedVariant] = useState<PreviewVariant>('remediated');
  const [isMounted, setIsMounted] = useState(false);

  const originalBlobUrl = useBlobUrl(file?.uploadedBytes);
  const remediatedBlobUrl = useBlobUrl(file?.remediatedBytes);

  const originalScore = computeDisplayedAutomatedScore({
    auditResult: file?.auditResult,
    variant: 'original'
  });
  const remediatedScore = computeDisplayedAutomatedScore({
    auditResult: file?.postRemediationAudit,
    variant: 'remediated',
    verapdfResult: file?.verapdfResult
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    return () => {
      if (originalBlobUrl) URL.revokeObjectURL(originalBlobUrl);
      if (remediatedBlobUrl) URL.revokeObjectURL(remediatedBlobUrl);
    };
  }, [originalBlobUrl, remediatedBlobUrl]);

  useEffect(() => {
    if (!previewFocus?.variant) return;
    setSelectedVariant(previewFocus.variant);
  }, [previewFocus?.variant]);

  if (!isMounted) {
    return null;
  }

  const activeVariant: PreviewVariant =
    selectedVariant === 'remediated' && !file?.remediatedBytes ? 'original' : selectedVariant;
  const activeTitle = activeVariant === 'remediated' ? 'Updated document review viewer' : 'Uploaded document review viewer';
  const activeBytes = activeVariant === 'remediated' ? file?.remediatedBytes : file?.uploadedBytes;
  const activeBlobUrl = activeVariant === 'remediated' ? remediatedBlobUrl : originalBlobUrl;
  const activeScore = activeVariant === 'remediated' ? remediatedScore : originalScore;
  const activeFileName =
    activeVariant === 'remediated' ? (file ? `remediated-${file.name}` : 'remediated.pdf') : file?.name ?? 'original.pdf';
  const pageFocus = previewFocus && previewFocus.variant === activeVariant ? previewFocus.page : undefined;
  const iframeSrc = activeBlobUrl ? (pageFocus ? `${activeBlobUrl}#page=${pageFocus}` : activeBlobUrl) : undefined;

  return (
    <section className="space-y-4">
      <div>
        <h3>Reference viewer</h3>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">
          Review one document at a time, switch between the uploaded and updated PDF, and use focused findings to jump to the relevant page.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DocumentSelectorCard
          title="Uploaded PDF"
          score={originalScore}
          bytes={file?.uploadedBytes}
          active={activeVariant === 'original'}
          onSelect={() => setSelectedVariant('original')}
        />
        <DocumentSelectorCard
          title="Updated PDF"
          score={remediatedScore}
          bytes={file?.remediatedBytes}
          active={activeVariant === 'remediated'}
          onSelect={() => setSelectedVariant('remediated')}
        />
      </div>

      <article className="space-y-3 rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-2xl font-semibold leading-tight text-[var(--ucsd-navy)]">{activeTitle}</p>
            <div className="mt-3 rounded-md bg-[rgba(0,98,155,0.08)] px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ucsd-text)]">Automated baseline</p>
              <p className={`mt-1 text-3xl font-bold leading-none ${scoreTone(activeScore)}`}>{scoreValue(activeScore)}</p>
            </div>
            <p className="mt-2 text-sm text-[var(--ucsd-text)]">
              Accessibility fixes often do not change visible rendering. Use this viewer to confirm page context while reviewing findings and manual edits.
            </p>
            {previewFocus && previewFocus.variant === activeVariant ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-[rgba(0,98,155,0.15)] bg-[rgba(0,98,155,0.06)] px-3 py-2 text-sm text-[var(--ucsd-text)]">
                <span>
                  Focused item: {previewFocus.label} on page {previewFocus.page}
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewFocus(fileId, undefined)}
                  className="rounded-md border border-[rgba(24,43,73,0.2)] bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50"
                >
                  Clear focus
                </button>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={activeBlobUrl ?? undefined}
              download={activeFileName}
              className={`inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition ${
                activeBlobUrl
                  ? 'bg-[var(--ucsd-blue)] text-white hover:bg-[var(--ucsd-navy)]'
                  : 'pointer-events-none bg-gray-300 text-white'
              }`}
              aria-disabled={!activeBlobUrl}
            >
              Download this PDF
            </a>
            <a
              href={iframeSrc}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium transition ${
                activeBlobUrl
                  ? 'border-[rgba(24,43,73,0.25)] text-[var(--ucsd-text)] hover:bg-slate-50'
                  : 'pointer-events-none border-gray-300 text-gray-400'
              }`}
              aria-disabled={!activeBlobUrl}
            >
              Open in new tab
            </a>
          </div>
        </div>

        {previewFocus?.bounds && previewFocus.variant === activeVariant && activeBytes ? (
          <div className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
            <PdfRegionThumbnail
              bytes={activeBytes}
              page={previewFocus.page}
              bounds={previewFocus.bounds}
              label={previewFocus.label}
            />
            <div className="rounded border border-[rgba(24,43,73,0.12)] bg-slate-50 p-3 text-sm text-[var(--ucsd-text)]">
              <p className="font-medium text-[var(--ucsd-navy)]">{previewFocus.label}</p>
              <p className="mt-1">The main viewer below is opened to page {previewFocus.page} for this focused item.</p>
              {previewFocus.bounds ? (
                <p className="mt-1 text-xs">
                  Bounds: x {Math.round(previewFocus.bounds.x)}, y {Math.round(previewFocus.bounds.y)}, w{' '}
                  {Math.round(previewFocus.bounds.width)}, h {Math.round(previewFocus.bounds.height)}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {!activeBlobUrl ? (
          <div className="rounded border border-[rgba(24,43,73,0.15)] bg-slate-50 p-4 text-sm text-[var(--ucsd-text)]">
            This preview is unavailable right now. Upload or process the file in this browser session, then open Compare again.
          </div>
        ) : (
          <iframe
            src={iframeSrc}
            title={activeTitle}
            className="h-[78vh] w-full rounded border border-[rgba(24,43,73,0.2)]"
          />
        )}
      </article>
    </section>
  );
}
