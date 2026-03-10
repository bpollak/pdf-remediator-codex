'use client';

import { useMemo, useState } from 'react';
import { PdfRegionThumbnail } from './PdfRegionThumbnail';
import { useAppStore } from '@/stores/app-store';
import {
  getAltTextDraftForImage,
  getNearbyTextSnippet,
  summarizeManualReviewState
} from '@/lib/report/manual-review';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function downloadTextFile(fileName: string, text: string, mimeType = 'application/json') {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function AltTextWorkspace({ fileId }: { fileId: string }) {
  const file = useAppStore((state) => state.files.find((entry) => entry.id === fileId));
  const updateAltTextDraft = useAppStore((state) => state.updateAltTextDraft);
  const markWorkflowProgress = useAppStore((state) => state.markWorkflowProgress);
  const setPreviewFocus = useAppStore((state) => state.setPreviewFocus);
  const parsed = file?.remediatedParsedData ?? file?.parsedData;
  const sourceBytes = file?.remediatedParsedData ? file?.remediatedBytes ?? file?.uploadedBytes : file?.uploadedBytes;
  const images = useMemo(
    () => [...(parsed?.images ?? [])].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x),
    [parsed?.images]
  );
  const summary = summarizeManualReviewState(file);
  const [showMissingOnly, setShowMissingOnly] = useState(true);

  const entries = useMemo(
    () =>
      images.map((image, index) => {
        const draft = getAltTextDraftForImage(file, image);
        const label = `Image ${index + 1} on page ${image.page}`;
        const needsAlt = !draft.decorative && draft.alt.trim().length === 0;
        const nearbyText = parsed ? getNearbyTextSnippet(parsed, image) : undefined;

        return {
          image,
          draft,
          label,
          needsAlt,
          nearbyText
        };
      }),
    [file, images, parsed]
  );

  const visibleEntries = showMissingOnly ? entries.filter((entry) => entry.needsAlt) : entries;

  const worksheetPayload = useMemo(
    () => ({
      generatedAt: new Date().toISOString(),
      documentName: file?.name ?? 'uploaded.pdf',
      base: file?.remediatedParsedData ? 'remediated' : 'original',
      images: entries.map((entry) => ({
        id: entry.image.id,
        label: entry.label,
        page: entry.image.page,
        x: Math.round(entry.image.x),
        y: Math.round(entry.image.y),
        width: Math.round(entry.image.width),
        height: Math.round(entry.image.height),
        decorative: entry.draft.decorative,
        alt: entry.draft.alt.trim(),
        nearbyText: entry.nearbyText
      }))
    }),
    [entries, file?.name, file?.remediatedParsedData]
  );

  function updateDraftForImage(
    image: (typeof entries)[number]['image'],
    nextDraft: { alt: string; decorative: boolean }
  ) {
    const normalizedAlt = nextDraft.alt;
    const matchesOriginal = normalizedAlt === (image.alt ?? '') && nextDraft.decorative === Boolean(image.decorative);
    updateAltTextDraft(fileId, image.id, matchesOriginal ? undefined : { alt: normalizedAlt, decorative: nextDraft.decorative });
  }

  function jumpToPreview(entry: (typeof entries)[number]) {
    setPreviewFocus(fileId, {
      variant: file?.remediatedParsedData ? 'remediated' : 'original',
      page: entry.image.page,
      label: entry.label,
      bounds: {
        x: entry.image.x,
        y: entry.image.y,
        width: entry.image.width,
        height: entry.image.height
      }
    });
    document.getElementById('review-step')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function exportJson() {
    const safeName = slugify(file?.name ?? 'document');
    markWorkflowProgress(fileId, {
      altTextPreparedAt: file?.workflowProgress?.altTextPreparedAt ?? new Date().toISOString()
    });
    downloadTextFile(`${safeName}-alt-text-worksheet.json`, JSON.stringify(worksheetPayload, null, 2));
  }

  function exportCsv() {
    const safeName = slugify(file?.name ?? 'document');
    markWorkflowProgress(fileId, {
      altTextPreparedAt: file?.workflowProgress?.altTextPreparedAt ?? new Date().toISOString()
    });
    const header = ['id', 'label', 'page', 'x', 'y', 'width', 'height', 'decorative', 'alt', 'nearbyText'];
    const rows = worksheetPayload.images.map((image) =>
      [
        image.id,
        image.label,
        String(image.page),
        String(image.x),
        String(image.y),
        String(image.width),
        String(image.height),
        image.decorative ? 'true' : 'false',
        image.alt,
        image.nearbyText ?? ''
      ]
        .map(csvEscape)
        .join(',')
    );
    downloadTextFile(`${safeName}-alt-text-worksheet.csv`, [header.join(','), ...rows].join('\n'), 'text/csv');
  }

  if (!parsed) {
    return (
      <section className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
        <h2>Alt Text Workspace</h2>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">Process a file first to review image alt-text coverage.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
      <div>
        <h2>Alt Text Workspace</h2>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">
          Review detected images, draft alt text, mark decorative images, and export a worksheet for manual remediation.
        </p>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">
          Draft edits persist in this browser and block publish readiness until you validate a revised PDF.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => setShowMissingOnly((value) => !value)}
          className="rounded-md border border-[rgba(24,43,73,0.25)] px-2.5 py-1 text-[var(--ucsd-text)] hover:bg-slate-50"
        >
          {showMissingOnly ? 'Showing missing only' : 'Showing all images'}
        </button>
        <span className="text-[var(--ucsd-text)]">
          Draft progress: {summary.altText.completedCount} of {summary.altText.totalImages} images covered
        </span>
        <span className="text-[var(--ucsd-text)]">
          Missing alt coverage: {summary.altText.missingCount} of {summary.altText.totalImages}
        </span>
        {summary.pendingRevalidation ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
            Pending re-validation
          </span>
        ) : null}
        <button
          type="button"
          onClick={exportJson}
          className="rounded-md bg-[var(--ucsd-blue)] px-2.5 py-1 text-white hover:bg-[var(--ucsd-navy)]"
        >
          Export JSON worksheet
        </button>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-md border border-[rgba(24,43,73,0.25)] px-2.5 py-1 text-[var(--ucsd-text)] hover:bg-slate-50"
        >
          Export CSV worksheet
        </button>
      </div>

      {visibleEntries.length === 0 ? (
        <p className="text-sm text-[var(--ucsd-text)]">No images match the current filter.</p>
      ) : (
        <div className="max-h-[60vh] space-y-3 overflow-auto pr-1">
          {visibleEntries.map((entry) => (
            <article key={entry.image.id} className="rounded border border-[rgba(24,43,73,0.15)] p-3">
              <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
                <div className="space-y-2">
                  <PdfRegionThumbnail
                    bytes={sourceBytes}
                    page={entry.image.page}
                    bounds={{
                      x: entry.image.x,
                      y: entry.image.y,
                      width: entry.image.width,
                      height: entry.image.height
                    }}
                    label={entry.label}
                  />
                  <button
                    type="button"
                    onClick={() => jumpToPreview(entry)}
                    className="inline-flex items-center rounded-md border border-[rgba(24,43,73,0.25)] px-3 py-1.5 text-xs font-medium text-[var(--ucsd-text)] hover:bg-slate-50"
                  >
                    Jump to reference preview
                  </button>
                </div>

                <div>
                  <p className="text-sm font-medium text-[var(--ucsd-navy)]">{entry.label}</p>
                  <p className="mt-1 text-xs text-[var(--ucsd-text)]">
                    Stable ID: {entry.image.id} · Bounds: x {Math.round(entry.image.x)}, y {Math.round(entry.image.y)}, w{' '}
                    {Math.round(entry.image.width)}, h {Math.round(entry.image.height)}
                  </p>
                  {entry.nearbyText ? (
                    <p className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-[var(--ucsd-text)]">
                      Nearby text: {entry.nearbyText}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-[var(--ucsd-text)]">Nearby text: none detected near this image.</p>
                  )}
                  <label className="mt-3 flex items-center gap-2 text-xs text-[var(--ucsd-text)]">
                    <input
                      type="checkbox"
                      checked={entry.draft.decorative}
                      onChange={(event) =>
                        updateDraftForImage(entry.image, {
                          ...entry.draft,
                          decorative: event.target.checked
                        })
                      }
                    />
                    Mark as decorative
                  </label>
                  <textarea
                    value={entry.draft.alt}
                    onChange={(event) =>
                      updateDraftForImage(entry.image, {
                        ...entry.draft,
                        alt: event.target.value
                      })
                    }
                    rows={3}
                    placeholder={entry.draft.decorative ? 'Decorative image (alt not required)' : 'Describe what this image communicates'}
                    className="mt-2 w-full rounded border border-[rgba(24,43,73,0.2)] p-2 text-sm"
                    disabled={entry.draft.decorative}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
