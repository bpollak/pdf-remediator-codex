'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PdfRegionThumbnail } from './PdfRegionThumbnail';
import { renderPdfRegionToDataUrl } from '@/lib/pdf/renderer';
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

interface AltTextSuggestion {
  alt: string;
  decorative: boolean;
  rationale?: string;
}

type SuggestionState =
  | { status: 'loading' }
  | { status: 'ready'; suggestion: AltTextSuggestion }
  | { status: 'error'; error: string };

function AltTextEditor({
  draft,
  imageId,
  onSave,
  onEditingChange
}: {
  draft: { alt: string; decorative: boolean };
  imageId: string;
  onSave: (next: { alt: string; decorative: boolean }) => void;
  onEditingChange: (editing: boolean) => void;
}) {
  const [localAlt, setLocalAlt] = useState(draft.alt);
  const [localDecorative, setLocalDecorative] = useState(draft.decorative);
  const [saved, setSaved] = useState(false);
  const prevImageId = useRef(imageId);
  const prevDraft = useRef(draft);

  // Sync from store when the draft changes externally (e.g. switching images or applying a suggestion).
  useEffect(() => {
    if (
      prevImageId.current !== imageId ||
      prevDraft.current.alt !== draft.alt ||
      prevDraft.current.decorative !== draft.decorative
    ) {
      setLocalAlt(draft.alt);
      setLocalDecorative(draft.decorative);
      setSaved(false);
      prevImageId.current = imageId;
      prevDraft.current = draft;
    }
  }, [imageId, draft.alt, draft.decorative]);

  const hasChanges = localAlt !== draft.alt || localDecorative !== draft.decorative;

  function handleSave() {
    onSave({ alt: localAlt, decorative: localDecorative });
    onEditingChange(false);
    setSaved(true);
  }

  return (
    <>
      <label className="mt-3 flex items-center gap-2 text-xs text-[var(--ucsd-text)]">
        <input
          type="checkbox"
          checked={localDecorative}
          onChange={(event) => {
            setLocalDecorative(event.target.checked);
            onEditingChange(true);
            setSaved(false);
          }}
        />
        Mark as decorative
      </label>
      <textarea
        value={localAlt}
        onChange={(event) => {
          setLocalAlt(event.target.value);
          onEditingChange(true);
          setSaved(false);
        }}
        rows={3}
        placeholder={localDecorative ? 'Decorative image (alt not required)' : 'Describe what this image communicates'}
        className="mt-2 w-full rounded border border-[rgba(24,43,73,0.2)] p-2 text-sm"
        disabled={localDecorative}
      />
      <div className="mt-2 flex items-center gap-2">
        {hasChanges && (
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center rounded-md bg-[var(--ucsd-blue)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--ucsd-navy)]"
          >
            Save
          </button>
        )}
        {saved && !hasChanges && (
          <p className="rounded bg-green-50 border border-green-200 px-3 py-1.5 text-xs text-green-800">
            Saved. Continue adding descriptions for the remaining images, then follow the instructions above to finish.
          </p>
        )}
      </div>
    </>
  );
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
  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, SuggestionState>>({});

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

  const visibleEntries = showMissingOnly
    ? entries.filter((entry) => entry.needsAlt || entry.image.id === editingImageId)
    : entries;

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

  async function suggestAltText(entry: (typeof entries)[number]) {
    if (!sourceBytes) {
      setSuggestions((state) => ({
        ...state,
        [entry.image.id]: { status: 'error', error: 'PDF bytes are unavailable for this browser session.' }
      }));
      return;
    }

    setSuggestions((state) => ({ ...state, [entry.image.id]: { status: 'loading' } }));

    try {
      const imageDataUrl = await renderPdfRegionToDataUrl({
        bytes: sourceBytes,
        pageNumber: entry.image.page,
        bounds: {
          x: entry.image.x,
          y: entry.image.y,
          width: entry.image.width,
          height: entry.image.height
        }
      });
      const response = await fetch('/api/alt-text', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl,
          imageLabel: entry.label,
          documentName: file?.name,
          nearbyText: entry.nearbyText,
          page: entry.image.page
        })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : `Alt-text request failed (${response.status})`);
      }

      setSuggestions((state) => ({
        ...state,
        [entry.image.id]: {
          status: 'ready',
          suggestion: {
            alt: typeof payload.alt === 'string' ? payload.alt : '',
            decorative: payload.decorative === true,
            rationale: typeof payload.rationale === 'string' ? payload.rationale : undefined
          }
        }
      }));
    } catch (error) {
      setSuggestions((state) => ({
        ...state,
        [entry.image.id]: {
          status: 'error',
          error: error instanceof Error ? error.message : 'Could not generate an alt-text recommendation.'
        }
      }));
    }
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
          Every image in your PDF needs a short description (called &ldquo;alt text&rdquo;) so that screen readers can describe it to people who cannot see it. Decorative images like borders or background patterns can be marked as decorative instead.
        </p>
        <div className="mt-3 rounded-md border border-[rgba(0,98,155,0.15)] bg-[rgba(0,98,155,0.04)] p-3 text-sm text-[var(--ucsd-text)]">
          <p className="font-medium text-[var(--ucsd-navy)]">How this works:</p>
          <ol className="mt-1 ml-4 list-decimal space-y-1">
            <li>Write a description for each image below, or check &ldquo;Mark as decorative&rdquo; if the image is purely visual.</li>
            <li>Click <strong>Save</strong> after each description.</li>
            <li>When you have covered all images, click <strong>Download descriptions as spreadsheet</strong> or <strong>Download descriptions as data file</strong> to save your work.</li>
            <li>Open your PDF in Adobe Acrobat and add the descriptions to each image using the downloaded file as a reference.</li>
            <li>Upload the updated PDF in the &ldquo;Validate revised PDF&rdquo; step below to confirm your changes.</li>
          </ol>
        </div>
      </div>

      {summary.altText.missingCount === 0 && summary.altText.totalImages > 0 && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <p className="font-medium">All {summary.altText.totalImages} images are covered — great work!</p>
          <p className="mt-1">
            Download your descriptions using the buttons below, then open your PDF in Adobe Acrobat to add them to each image.
            When you are done, upload the updated PDF in the &ldquo;Validate revised PDF&rdquo; step to confirm everything is correct.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => setShowMissingOnly((value) => !value)}
          className="rounded-md border border-[rgba(24,43,73,0.25)] px-2.5 py-1 text-[var(--ucsd-text)] hover:bg-slate-50"
        >
          {showMissingOnly ? 'Showing images that still need descriptions' : 'Showing all images'}
        </button>
        <span className="text-[var(--ucsd-text)]">
          {summary.altText.completedCount} of {summary.altText.totalImages} images have descriptions
        </span>
        {summary.altText.missingCount > 0 && (
          <span className="text-[var(--ucsd-text)]">
            ({summary.altText.missingCount} still {summary.altText.missingCount === 1 ? 'needs' : 'need'} a description)
          </span>
        )}
        {summary.pendingRevalidation ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
            Needs re-validation
          </span>
        ) : null}
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-md bg-[var(--ucsd-blue)] px-2.5 py-1 text-white hover:bg-[var(--ucsd-navy)]"
        >
          Download descriptions as spreadsheet
        </button>
        <button
          type="button"
          onClick={exportJson}
          className="rounded-md border border-[rgba(24,43,73,0.25)] px-2.5 py-1 text-[var(--ucsd-text)] hover:bg-slate-50"
        >
          Download descriptions as data file
        </button>
      </div>

      {visibleEntries.length === 0 ? (
        <p className="text-sm text-[var(--ucsd-text)]">No images match the current filter.</p>
      ) : (
        <div className="max-h-[60vh] space-y-3 overflow-auto pr-1">
          {visibleEntries.map((entry) => {
            const suggestionState = suggestions[entry.image.id];
            return (
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
                    <div className="mt-3 rounded border border-[rgba(24,43,73,0.12)] bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => suggestAltText(entry)}
                          disabled={suggestionState?.status === 'loading'}
                          className="inline-flex items-center rounded-md border border-[rgba(24,43,73,0.25)] px-3 py-1.5 text-xs font-medium text-[var(--ucsd-text)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {suggestionState?.status === 'loading' ? 'Suggesting...' : 'Suggest with TritonAI'}
                        </button>
                        <p className="text-xs text-[var(--ucsd-text)]">
                          Review generated suggestions before saving them.
                        </p>
                      </div>

                      {suggestionState?.status === 'ready' ? (
                        <div className="mt-2 rounded border border-green-200 bg-white p-2 text-xs text-[var(--ucsd-text)]">
                          <p className="font-medium text-green-800">
                            {suggestionState.suggestion.decorative
                              ? 'Suggested as decorative'
                              : suggestionState.suggestion.alt}
                          </p>
                          {suggestionState.suggestion.rationale ? (
                            <p className="mt-1">{suggestionState.suggestion.rationale}</p>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => updateDraftForImage(entry.image, suggestionState.suggestion)}
                            className="mt-2 inline-flex items-center rounded-md bg-[var(--ucsd-blue)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--ucsd-navy)]"
                          >
                            Apply suggestion
                          </button>
                        </div>
                      ) : null}

                      {suggestionState?.status === 'error' ? (
                        <p className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">
                          {suggestionState.error}
                        </p>
                      ) : null}
                    </div>
                    <AltTextEditor
                      draft={entry.draft}
                      imageId={entry.image.id}
                      onSave={(nextDraft) => updateDraftForImage(entry.image, nextDraft)}
                      onEditingChange={(editing) => setEditingImageId(editing ? entry.image.id : null)}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
