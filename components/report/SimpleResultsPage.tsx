'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { HelpTip } from '@/components/report/HelpTip';
import { PdfRegionThumbnail } from '@/components/report/PdfRegionThumbnail';
import { renderPdfRegionToDataUrl } from '@/lib/pdf/renderer';
import { detectTables } from '@/lib/remediate/heuristics';
import { getAccessibilityStatus } from '@/lib/report/accessibility-status';
import {
  getAltTextDraftForImage,
  getManualReviewDrafts,
  getStructureTableDecision,
  getTableDraftKey,
  summarizeManualCompletion
} from '@/lib/report/manual-review';
import { useAppStore } from '@/stores/app-store';
import type { ManualCustomElementCategory } from '@/types/file-entry';

type SuggestionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; alt: string; decorative: boolean }
  | { status: 'error'; message: string };

type ApplyState =
  | { status: 'idle' }
  | { status: 'working' }
  | { status: 'done'; applied: number; skipped: Array<{ imageId: string; reason: string }> }
  | { status: 'error'; message: string };

const categoryLabels: Record<ManualCustomElementCategory, string> = {
  'alt-text': 'Image description',
  structure: 'Document structure',
  'reading-order': 'Reading order',
  table: 'Table',
  'form-field': 'Form field',
  metadata: 'Document details',
  other: 'Other'
};

const categoryOptions = Object.entries(categoryLabels) as Array<[ManualCustomElementCategory, string]>;

function manualStatusLabel(remaining: number) {
  if (remaining === 0) return 'No manual edits listed';
  if (remaining === 1) return '1 manual edit left';
  return `${remaining} manual edits left`;
}

const statusToneClasses: Record<ReturnType<typeof getAccessibilityStatus>['status'], string> = {
  accessible: 'border-green-200 bg-green-50',
  'not-yet-accessible': 'border-amber-200 bg-amber-50',
  'verification-unavailable': 'border-amber-200 bg-amber-50',
  processing: 'border-[rgba(0,98,155,0.25)] bg-[rgba(0,98,155,0.06)]'
};

export function SimpleResultsPage({ fileId }: { fileId: string }) {
  const file = useAppStore((state) => state.files.find((entry) => entry.id === fileId));
  const updateAltTextDraft = useAppStore((state) => state.updateAltTextDraft);
  const updateStructureTableDraft = useAppStore((state) => state.updateStructureTableDraft);
  const addManualCustomElement = useAppStore((state) => state.addManualCustomElement);
  const updateManualCustomElement = useAppStore((state) => state.updateManualCustomElement);
  const removeManualCustomElement = useAppStore((state) => state.removeManualCustomElement);
  const markWorkflowProgress = useAppStore((state) => state.markWorkflowProgress);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<ManualCustomElementCategory>('structure');
  const [newItemNote, setNewItemNote] = useState('');
  const [suggestions, setSuggestions] = useState<Record<string, SuggestionState>>({});
  const [applyState, setApplyState] = useState<ApplyState>({ status: 'idle' });

  const parsed = file?.remediatedParsedData ?? file?.parsedData;
  const sourceBytes = file?.remediatedParsedData ? file?.remediatedBytes ?? file?.uploadedBytes : file?.uploadedBytes;
  const completion = summarizeManualCompletion(file);
  const drafts = getManualReviewDrafts(file);
  const remaining = Math.max(completion.total - completion.completed, 0);
  const revalidationHref = file ? `/app?revalidateFor=${encodeURIComponent(file.id)}#upload-revised-pdf` : '/app';

  const imageEntries = useMemo(() => {
    const images = [...(parsed?.images ?? [])].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
    return images
      .map((image, index) => {
        const draft = getAltTextDraftForImage(file, image);
        return {
          image,
          draft,
          label: `Image ${index + 1}`,
          needsWork: !draft.decorative && draft.alt.trim().length === 0
        };
      })
      .filter((entry) => entry.needsWork || drafts.altText[entry.image.id]);
  }, [drafts.altText, file, parsed?.images]);

  const tableEntries = useMemo(() => {
    if (!parsed) return [];
    return detectTables(parsed).map((table, index) => {
      const key = getTableDraftKey(table, index);
      return {
        key,
        page: table.page,
        decision: getStructureTableDecision(file, key)
      };
    });
  }, [file, parsed]);

  const savedDescriptionDrafts = useMemo(
    () =>
      Object.entries(drafts.altText)
        .map(([imageId, draft]) => ({ imageId, alt: draft.alt.trim(), decorative: draft.decorative }))
        .filter((entry) => entry.decorative || entry.alt.length > 0),
    [drafts.altText]
  );

  function triggerDownload(bytes: BlobPart, name: string) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
    markWorkflowProgress(fileId, {
      downloadedAt: file?.workflowProgress?.downloadedAt ?? new Date().toISOString()
    });
  }

  function downloadUpdatedPdf() {
    if (!file?.remediatedBytes) return;
    triggerDownload(file.remediatedBytes, `remediated-${file.name}`);
  }

  async function applyDescriptionsAndDownload() {
    if (!file?.remediatedBytes || savedDescriptionDrafts.length === 0) return;
    setApplyState({ status: 'working' });

    try {
      const { applyManualAltText } = await import('@/lib/remediate/apply-alt-text');
      const pageImageCounts: Record<number, number> = {};
      for (const image of parsed?.images ?? []) {
        pageImageCounts[image.page] = (pageImageCounts[image.page] ?? 0) + 1;
      }

      const outcome = await applyManualAltText(file.remediatedBytes, savedDescriptionDrafts, pageImageCounts);
      if (outcome.applied.length > 0) {
        triggerDownload(outcome.bytes as BlobPart, `remediated-${file.name}`);
      }
      setApplyState({ status: 'done', applied: outcome.applied.length, skipped: outcome.skipped });
    } catch (error) {
      setApplyState({
        status: 'error',
        message:
          error instanceof Error
            ? `Could not embed the descriptions (${error.message}). Download the updated PDF and apply them in Acrobat instead.`
            : 'Could not embed the descriptions. Download the updated PDF and apply them in Acrobat instead.'
      });
    }
  }

  function saveAltText(imageId: string, alt: string, decorative: boolean) {
    updateAltTextDraft(fileId, imageId, { alt, decorative });
  }

  async function suggestAltText(entry: (typeof imageEntries)[number]) {
    if (!sourceBytes) {
      setSuggestions((state) => ({
        ...state,
        [entry.image.id]: { status: 'error', message: 'This image is not available in this browser session.' }
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
          page: entry.image.page
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const baseMessage = typeof payload.error === 'string' ? payload.error : 'Could not suggest text for this image.';
        const hint = typeof payload.hint === 'string' ? ` ${payload.hint}` : '';
        throw new Error(`${baseMessage}${hint} You can still write the description yourself below.`);
      }
      setSuggestions((state) => ({
        ...state,
        [entry.image.id]: {
          status: 'ready',
          alt: typeof payload.alt === 'string' ? payload.alt : '',
          decorative: payload.decorative === true
        }
      }));
    } catch (error) {
      setSuggestions((state) => ({
        ...state,
        [entry.image.id]: {
          status: 'error',
          message: error instanceof Error ? error.message : 'Could not suggest text for this image.'
        }
      }));
    }
  }

  function addManualItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addManualCustomElement(fileId, {
      title: newItemTitle,
      category: newItemCategory,
      note: newItemNote
    });
    setNewItemTitle('');
    setNewItemCategory('structure');
    setNewItemNote('');
  }

  if (!file) {
    return (
      <div className="space-y-4">
        <h1>Result unavailable</h1>
        <p className="max-w-2xl text-sm text-[var(--ucsd-text)]">
          This result is not saved in this browser session. Upload the PDF again to create a fresh result.
        </p>
        <Link
          href="/app"
          className="inline-flex rounded-md bg-[var(--ucsd-blue)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--ucsd-navy)]"
        >
          Upload PDF
        </Link>
      </div>
    );
  }

  const accessibility = getAccessibilityStatus(file);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="break-words">Finish your PDF</h1>
        <p className="break-words text-sm text-[var(--ucsd-text)]">{file.name}</p>
      </div>

      <section className={`rounded-lg border p-5 shadow-sm ${statusToneClasses[accessibility.status]}`}>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ucsd-text)]">
          Is this PDF ready to publish?
        </p>
        <p className="mt-1 text-2xl font-semibold text-[var(--ucsd-navy)]">{accessibility.label}</p>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--ucsd-text)]">{accessibility.message}</p>
        {accessibility.reasons.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {accessibility.reasons.map((reason) => (
              <li
                key={reason.code}
                className="inline-flex items-center rounded-full border border-[rgba(24,43,73,0.2)] bg-white px-2.5 py-0.5 text-xs font-medium text-[var(--ucsd-navy)]"
              >
                {reason.label}
              </li>
            ))}
          </ul>
        ) : null}
        {file.remediationMode === 'analysis-only' ? (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ucsd-text)]">
            <span className="font-semibold">Analysis-only result</span>
            <HelpTip label="analysis-only result">
              Analysis-only means the app could check this document but could not safely add the hidden structure
              tags that screen readers rely on. Those tags must be added manually before the PDF can be considered
              accessible.
            </HelpTip>
            : this file was checked but could not be fully auto-fixed. Add document tags manually in Adobe Acrobat
            or the free{' '}
            <a
              href="https://pac.pdf-accessibility.org/"
              target="_blank"
              rel="noreferrer"
              className="underline text-[var(--ucsd-blue)] hover:text-[var(--ucsd-navy)]"
            >
              PAC tool
            </a>{' '}
            before publishing.
          </p>
        ) : null}
        {file.ocrAttempted && !file.ocrApplied ? (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ucsd-text)]">
            <span className="font-semibold">Scanned text notice:</span> this file looks like a scanned document, but
            OCR could not add searchable text{file.ocrReason ? ` (${file.ocrReason})` : ''}. The updated PDF may not
            be readable by screen readers. Run OCR in a desktop tool (such as Adobe Acrobat), then upload the
            OCR&rsquo;d file for a new check.
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-[rgba(24,43,73,0.18)] bg-white p-5 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ucsd-text)]">Next step</p>
            <h2 className="mt-1 text-2xl font-semibold text-[var(--ucsd-navy)]">
              {remaining > 0 ? 'Complete the manual edits below' : 'Download the updated PDF'}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ucsd-text)]">
              {remaining > 0
                ? 'Save descriptions, confirm tables, or add any missing manual tasks. When you are done, apply those edits to the PDF or source file and upload the revised PDF.'
                : 'No manual edits are listed right now. Save the updated PDF, then do your normal final review before publishing.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {savedDescriptionDrafts.length > 0 ? (
                <button
                  type="button"
                  onClick={applyDescriptionsAndDownload}
                  disabled={!file.remediatedBytes || applyState.status === 'working'}
                  className="inline-flex rounded-md bg-[var(--ucsd-blue)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--ucsd-navy)] disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {applyState.status === 'working'
                    ? 'Embedding descriptions...'
                    : `Download PDF with my ${savedDescriptionDrafts.length === 1 ? 'description' : 'descriptions'}`}
                </button>
              ) : null}
              <button
                type="button"
                onClick={downloadUpdatedPdf}
                disabled={!file.remediatedBytes}
                className={
                  savedDescriptionDrafts.length > 0
                    ? 'inline-flex rounded-md border border-[rgba(24,43,73,0.25)] px-4 py-2.5 text-sm font-semibold text-[var(--ucsd-navy)] hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-gray-400'
                    : 'inline-flex rounded-md bg-[var(--ucsd-blue)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--ucsd-navy)] disabled:cursor-not-allowed disabled:bg-gray-300'
                }
              >
                {savedDescriptionDrafts.length > 0 ? 'Download without descriptions' : 'Download updated PDF'}
              </button>
              <Link
                href={revalidationHref}
                className="inline-flex rounded-md border border-[rgba(24,43,73,0.25)] px-4 py-2.5 text-sm font-semibold text-[var(--ucsd-navy)] hover:bg-slate-50"
              >
                Upload revised PDF
              </Link>
            </div>
            {applyState.status === 'done' ? (
              <div className="mt-3 max-w-2xl rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                <p>
                  {applyState.applied > 0
                    ? `Embedded ${applyState.applied} ${applyState.applied === 1 ? 'description' : 'descriptions'} into the downloaded PDF. Upload that file above to re-check it.`
                    : 'No descriptions could be embedded automatically.'}
                </p>
                {applyState.skipped.length > 0 ? (
                  <p className="mt-1 text-amber-900">
                    {applyState.skipped.length} {applyState.skipped.length === 1 ? 'image' : 'images'} still need Acrobat:{' '}
                    {[...new Set(applyState.skipped.map((item) => item.reason))].join(' ')}
                  </p>
                ) : null}
              </div>
            ) : null}
            {applyState.status === 'error' ? (
              <p className="mt-3 max-w-2xl rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {applyState.message}
              </p>
            ) : null}
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ucsd-text)]">
              {savedDescriptionDrafts.length > 0
                ? 'Image descriptions you saved below are embedded only when you use the "Download PDF with my descriptions" button. Table decisions and other manual edits still need Acrobat or the source document.'
                : 'The download contains the automated fixes only. Descriptions and edits you draft below are saved in this browser as a worksheet — they are not added to the downloaded PDF until you use the embed option that appears after saving a description.'}
            </p>
          </div>
          <div className="rounded-md border border-[rgba(24,43,73,0.14)] bg-slate-50 p-4">
            <p className="text-sm font-semibold text-[var(--ucsd-navy)]">Progress</p>
            <p className="mt-1 text-3xl font-semibold text-[var(--ucsd-navy)]">{completion.percent}%</p>
            <div
              className="mt-3 h-2 rounded-full bg-white"
              role="progressbar"
              aria-label="Manual edit completion"
              aria-valuenow={completion.percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-2 rounded-full bg-[var(--ucsd-blue)]" style={{ width: `${completion.percent}%` }} />
            </div>
            <p className="mt-3 text-sm text-[var(--ucsd-text)]">{manualStatusLabel(remaining)}</p>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-[rgba(24,43,73,0.18)] bg-white p-5 shadow-sm">
        <div>
          <h2>Manual edits</h2>
          <p className="mt-1 text-sm text-[var(--ucsd-text)]">
            Use this list to prepare anything the app could not safely finish automatically.
          </p>
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p>
              <span className="font-semibold">How these edits reach the PDF:</span>
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Save image descriptions (or mark images decorative) below.</li>
              <li>
                Use <span className="font-semibold">Download PDF with my descriptions</span> above &mdash; the app
                embeds them into the file as accessibility tags. Images it cannot tag safely are listed for follow-up
                in Adobe Acrobat (Tags panel &rarr; Figure &rarr; Alt text).
              </li>
              <li>
                Table decisions and other manual edits stay a worksheet: apply those in Acrobat or the source
                document, then upload the revised PDF above to confirm.
              </li>
            </ol>
          </div>
        </div>

        {imageEntries.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-[var(--ucsd-navy)]">Image descriptions</h3>
            {imageEntries.map((entry) => {
              const suggestion = suggestions[entry.image.id] ?? { status: 'idle' };
              return (
                <article key={entry.image.id} className="rounded-md border border-[rgba(24,43,73,0.14)] p-3">
                  <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
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
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="font-semibold text-[var(--ucsd-navy)]">
                          {entry.label} on page {entry.image.page}
                        </h4>
                        <button
                          type="button"
                          onClick={() => suggestAltText(entry)}
                          disabled={suggestion.status === 'loading'}
                          className="rounded-md border border-[rgba(24,43,73,0.25)] px-3 py-1.5 text-xs font-medium text-[var(--ucsd-text)] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {suggestion.status === 'loading' ? 'Suggesting...' : 'Suggest description'}
                        </button>
                      </div>
                      {suggestion.status === 'ready' ? (
                        <div className="mt-2 rounded-md border border-green-200 bg-green-50 p-2 text-sm text-green-900">
                          <p>{suggestion.decorative ? 'Suggested as decorative.' : suggestion.alt}</p>
                          <button
                            type="button"
                            onClick={() => saveAltText(entry.image.id, suggestion.alt, suggestion.decorative)}
                            className="mt-2 rounded-md bg-[var(--ucsd-blue)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--ucsd-navy)]"
                          >
                            Use suggestion
                          </button>
                        </div>
                      ) : null}
                      {suggestion.status === 'error' ? (
                        <p className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">
                          {suggestion.message}
                        </p>
                      ) : null}
                      <div className="mt-3 flex items-center gap-2 text-sm text-[var(--ucsd-text)]">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={entry.draft.decorative}
                            onChange={(event) => saveAltText(entry.image.id, '', event.target.checked)}
                          />
                          Decorative image
                        </label>
                        <HelpTip label="decorative image">
                          Decorative images are purely visual and add no information — for example dividers, borders,
                          or background art. Marking an image decorative tells screen readers to skip it. If the image
                          conveys information, leave this unchecked and write a description instead.
                        </HelpTip>
                      </div>
                      <textarea
                        value={entry.draft.alt}
                        onChange={(event) => saveAltText(entry.image.id, event.target.value, false)}
                        disabled={entry.draft.decorative}
                        rows={3}
                        placeholder="Write the image description"
                        className="mt-2 w-full rounded-md border border-[rgba(24,43,73,0.2)] p-2 text-sm disabled:bg-slate-100"
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        {tableEntries.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-[var(--ucsd-navy)]">Tables</h3>
            <div className="grid gap-2 md:grid-cols-2">
              {tableEntries.map((table, index) => (
                <article key={table.key} className="rounded-md border border-[rgba(24,43,73,0.14)] p-3">
                  <h4 className="font-semibold text-[var(--ucsd-navy)]">
                    Table {index + 1} on page {table.page}
                  </h4>
                  <p className="mt-1 text-sm text-[var(--ucsd-text)]">Confirm whether this should be treated as a table.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => updateStructureTableDraft(fileId, table.key, 'confirm')}
                      className={`rounded-md border px-3 py-1.5 text-sm ${
                        table.decision === 'confirm'
                          ? 'border-green-300 bg-green-50 text-green-800'
                          : 'border-[rgba(24,43,73,0.2)] text-[var(--ucsd-text)] hover:bg-slate-50'
                      }`}
                    >
                      This is a table
                    </button>
                    <button
                      type="button"
                      onClick={() => updateStructureTableDraft(fileId, table.key, 'reject')}
                      className={`rounded-md border px-3 py-1.5 text-sm ${
                        table.decision === 'reject'
                          ? 'border-amber-300 bg-amber-50 text-amber-900'
                          : 'border-[rgba(24,43,73,0.2)] text-[var(--ucsd-text)] hover:bg-slate-50'
                      }`}
                    >
                      Not a table
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-[var(--ucsd-navy)]">Other manual edits</h3>
          {drafts.customElements.length > 0 ? (
            <div className="space-y-2">
              {drafts.customElements.map((item) => (
                <article key={item.id} className="rounded-md border border-[rgba(24,43,73,0.14)] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <label className="flex min-w-0 items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={item.status === 'done'}
                        onChange={(event) =>
                          updateManualCustomElement(fileId, item.id, {
                            status: event.target.checked ? 'done' : 'todo'
                          })
                        }
                        className="mt-1"
                      />
                      <span>
                        <span className="block break-words font-semibold text-[var(--ucsd-navy)]">{item.title}</span>
                        <span className="mt-1 block text-xs text-[var(--ucsd-text)]">
                          {categoryLabels[item.category]} · {item.status === 'done' ? 'Done' : 'To do'}
                        </span>
                        {item.note ? (
                          <span className="mt-2 block break-words text-sm text-[var(--ucsd-text)]">{item.note}</span>
                        ) : null}
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => removeManualCustomElement(fileId, item.id)}
                      className="rounded-md border border-[rgba(24,43,73,0.2)] px-2.5 py-1 text-xs text-[var(--ucsd-text)] hover:bg-slate-50"
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-[rgba(24,43,73,0.12)] bg-slate-50 p-3 text-sm text-[var(--ucsd-text)]">
              No extra manual edits have been added.
            </p>
          )}

          <form onSubmit={addManualItem} className="grid gap-3 rounded-md border border-[rgba(24,43,73,0.14)] p-3 md:grid-cols-[minmax(0,1fr)_190px]">
            <label className="text-sm font-semibold text-[var(--ucsd-navy)]">
              Add manual edit
              <input
                value={newItemTitle}
                onChange={(event) => setNewItemTitle(event.target.value)}
                placeholder="Example: Fix reading order on page 2"
                className="mt-1 block w-full rounded-md border border-[rgba(24,43,73,0.2)] px-3 py-2 text-sm font-normal text-[var(--ucsd-text)]"
              />
            </label>
            <label className="text-sm font-semibold text-[var(--ucsd-navy)]">
              Type
              <select
                value={newItemCategory}
                onChange={(event) => setNewItemCategory(event.target.value as ManualCustomElementCategory)}
                className="mt-1 block w-full rounded-md border border-[rgba(24,43,73,0.2)] px-3 py-2 text-sm font-normal text-[var(--ucsd-text)]"
              >
                {categoryOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-[var(--ucsd-navy)] md:col-span-2">
              Note
              <textarea
                value={newItemNote}
                onChange={(event) => setNewItemNote(event.target.value)}
                rows={2}
                placeholder="Optional details"
                className="mt-1 block w-full rounded-md border border-[rgba(24,43,73,0.2)] px-3 py-2 text-sm font-normal text-[var(--ucsd-text)]"
              />
            </label>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={!newItemTitle.trim()}
                className="rounded-md bg-[var(--ucsd-blue)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--ucsd-navy)] disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                Add edit
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="rounded-lg border border-[rgba(24,43,73,0.18)] bg-white p-5 shadow-sm">
        <h2>Validate the final PDF</h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--ucsd-text)]">
          After you apply the manual edits, upload the revised PDF to check it again.
        </p>
        <Link
          href={revalidationHref}
          className="mt-4 inline-flex rounded-md bg-[var(--ucsd-blue)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--ucsd-navy)]"
        >
          Upload revised PDF
        </Link>
      </section>
    </div>
  );
}
