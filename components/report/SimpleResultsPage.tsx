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
  | {
      status: 'done';
      applied: number;
      expected: number;
      downloaded: boolean;
      skipped: Array<{ imageId: string; reason: string }>;
    }
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
  if (remaining === 0) return 'Checklist complete';
  if (remaining === 1) return '1 checklist item left';
  return `${remaining} checklist items left`;
}

function readinessLabel(status: ReturnType<typeof getAccessibilityStatus>) {
  if (status.status === 'accessible') return 'Ready for final review';
  if (status.status === 'processing') return 'Still processing';
  return 'Not ready yet';
}

function readinessMessage(status: ReturnType<typeof getAccessibilityStatus>) {
  if (status.status === 'accessible') {
    return 'The automated checks passed. Download the PDF and complete your normal final spot-check before publishing.';
  }
  if (status.status === 'processing') return status.message;
  return 'The automated pass is complete, but this PDF still needs the checklist below before it can be published.';
}

function primaryReasonLabels(status: ReturnType<typeof getAccessibilityStatus>) {
  return status.reasons
    .filter((reason) =>
      ['analysis-only', 'pending-revalidation', 'source-artifact', 'verification-unavailable'].includes(reason.code)
    )
    .map((reason) => reason.label);
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
  const [showAddManualItem, setShowAddManualItem] = useState(false);

  const parsed = file?.remediatedParsedData ?? file?.parsedData;
  const sourceBytes = file?.remediatedParsedData ? file?.remediatedBytes ?? file?.uploadedBytes : file?.uploadedBytes;
  const completion = summarizeManualCompletion(file);
  const drafts = getManualReviewDrafts(file);
  const remaining = Math.max(completion.total - completion.completed, 0);
  const manualStructureRequired = file?.remediationMode === 'analysis-only';
  const manualStructureDone = Boolean(file?.workflowProgress?.structurePreparedAt);
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

      const expected = savedDescriptionDrafts.length;
      const outcome = await applyManualAltText(file.remediatedBytes, savedDescriptionDrafts, pageImageCounts);
      const complete = outcome.skipped.length === 0 && outcome.applied.length === expected;
      if (complete) {
        triggerDownload(outcome.bytes as BlobPart, `remediated-${file.name}`);
      }
      setApplyState({
        status: 'done',
        applied: outcome.applied.length,
        expected,
        downloaded: complete,
        skipped: outcome.skipped
      });
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

  function setManualStructureDone(done: boolean) {
    markWorkflowProgress(fileId, {
      structurePreparedAt: done ? file?.workflowProgress?.structurePreparedAt ?? new Date().toISOString() : undefined
    });
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
    setShowAddManualItem(false);
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
  const prominentReasons = primaryReasonLabels(accessibility);
  const hasSavedDescriptions = savedDescriptionDrafts.length > 0;
  const nextStepTitle =
    remaining > 0
      ? 'Finish the manual checklist'
      : hasSavedDescriptions
        ? 'Download the PDF with descriptions'
        : 'Download the updated PDF';
  const nextStepDescription =
    remaining > 0
      ? 'Work through the checklist below. When it is complete, download the best available PDF and upload your revised file for a final check.'
      : hasSavedDescriptions
        ? 'Your image descriptions are saved. Download the PDF that includes them, then upload that revised file to check it again.'
        : 'No manual checklist items are left in this browser. Download the updated PDF, then do your normal final review before publishing.';

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="break-words">Finish your PDF</h1>
        <p className="break-words text-sm text-[var(--ucsd-text)]">{file.name}</p>
      </div>

      <section className={`rounded-lg border p-5 shadow-sm ${statusToneClasses[accessibility.status]}`}>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ucsd-text)]">Readiness</p>
        <p className="mt-1 text-2xl font-semibold text-[var(--ucsd-navy)]">{readinessLabel(accessibility)}</p>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--ucsd-text)]">
          {readinessMessage(accessibility)}
        </p>
        {prominentReasons.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {prominentReasons.map((reason) => (
              <li
                key={reason}
                className="inline-flex items-center rounded-full border border-[rgba(24,43,73,0.2)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--ucsd-navy)]"
              >
                {reason}
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
        {accessibility.reasons.length > 0 ? (
          <details className="mt-3 max-w-2xl text-sm text-[var(--ucsd-text)]">
            <summary className="cursor-pointer font-semibold text-[var(--ucsd-navy)]">
              Show automated check details
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {accessibility.reasons.map((reason) => (
                <li key={`${reason.code}-${reason.label}`}>{reason.label}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="rounded-lg border border-[rgba(24,43,73,0.18)] bg-white p-5 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ucsd-text)]">Next step</p>
            <h2 className="mt-1 text-2xl font-semibold text-[var(--ucsd-navy)]">{nextStepTitle}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ucsd-text)]">{nextStepDescription}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {remaining > 0 ? (
                <a
                  href="#manual-checklist"
                  className="inline-flex rounded-md bg-[var(--ucsd-blue)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--ucsd-navy)]"
                >
                  Go to checklist
                </a>
              ) : null}
              {savedDescriptionDrafts.length > 0 ? (
                <button
                  type="button"
                  onClick={applyDescriptionsAndDownload}
                  disabled={!file.remediatedBytes || applyState.status === 'working'}
                  className={
                    remaining === 0
                      ? 'inline-flex rounded-md bg-[var(--ucsd-blue)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--ucsd-navy)] disabled:cursor-not-allowed disabled:bg-gray-300'
                      : 'inline-flex rounded-md border border-[rgba(24,43,73,0.25)] px-4 py-2.5 text-sm font-semibold text-[var(--ucsd-navy)] hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-gray-400'
                  }
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
                  remaining > 0 || savedDescriptionDrafts.length > 0
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
              <div
                className={`mt-3 max-w-2xl rounded-md border p-3 text-sm ${
                  applyState.downloaded
                    ? 'border-green-200 bg-green-50 text-green-900'
                    : 'border-amber-200 bg-amber-50 text-amber-950'
                }`}
              >
                <p>
                  {applyState.downloaded
                    ? `Embedded all ${applyState.applied} ${applyState.applied === 1 ? 'description' : 'descriptions'} into the downloaded PDF. Upload that file above to re-check it.`
                    : `Could not embed every saved image description. ${applyState.applied} of ${applyState.expected} ${applyState.expected === 1 ? 'description was' : 'descriptions were'} embedded, so no partial PDF was downloaded.`}
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
            {remaining === 0 ? (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ucsd-text)]">
                {savedDescriptionDrafts.length > 0
                  ? 'Use the description download when you want the saved image descriptions embedded into the PDF. Table decisions and other manual edits still need Acrobat or the source document.'
                  : 'This download contains the automated fixes the app could safely make.'}
              </p>
            ) : null}
          </div>
          <div className="rounded-md border border-[rgba(24,43,73,0.14)] bg-slate-50 p-4">
            <p className="text-sm font-semibold text-[var(--ucsd-navy)]">Manual checklist progress</p>
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

      <section
        id="manual-checklist"
        className="space-y-4 rounded-lg border border-[rgba(24,43,73,0.18)] bg-white p-5 shadow-sm"
      >
        <div>
          <h2>Manual checklist</h2>
          <p className="mt-1 text-sm text-[var(--ucsd-text)]">
            Complete each item that applies to this PDF. The progress meter updates as you save descriptions,
            confirm tables, or mark manual tasks done.
          </p>
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p>
              <span className="font-semibold">How to finish:</span>
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Save any image descriptions, or mark decorative images so screen readers can skip them.</li>
              <li>
                If a document structure or table item appears, apply that fix in Acrobat, PAC, or the source file.
              </li>
              <li>
                Download the best available PDF, make any desktop edits, then upload the revised PDF for validation.
              </li>
            </ol>
          </div>
        </div>

        {manualStructureRequired ? (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-[var(--ucsd-navy)]">Document structure</h3>
            <article
              className={`rounded-md border p-3 ${
                manualStructureDone ? 'border-green-200 bg-green-50' : 'border-[rgba(24,43,73,0.14)]'
              }`}
            >
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={manualStructureDone}
                  onChange={(event) => setManualStructureDone(event.target.checked)}
                  className="mt-1 h-5 w-5"
                />
                <span>
                  <span className="block font-semibold text-[var(--ucsd-navy)]">
                    Fix document structure in Acrobat or PAC
                  </span>
                  <span className="mt-1 block leading-relaxed text-[var(--ucsd-text)]">
                    Add or repair the hidden tags that screen readers use, including heading order, reading order, and
                    table structure. Check this only after you have made those edits in the PDF or source file.
                  </span>
                  <span className="mt-2 block text-xs font-semibold text-[var(--ucsd-text)]">
                    {manualStructureDone ? 'Done' : 'Required before publishing'}
                  </span>
                </span>
              </label>
            </article>
          </div>
        ) : null}

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
                        <label className="flex cursor-pointer items-center gap-2 py-1">
                          <input
                            type="checkbox"
                            checked={entry.draft.decorative}
                            onChange={(event) => saveAltText(entry.image.id, '', event.target.checked)}
                            className="h-5 w-5"
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
          <h3 className="text-lg font-semibold text-[var(--ucsd-navy)]">Other manual tasks</h3>
          {drafts.customElements.length > 0 ? (
            <div className="space-y-2">
              {drafts.customElements.map((item) => (
                <article key={item.id} className="rounded-md border border-[rgba(24,43,73,0.14)] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <label className="flex min-w-0 cursor-pointer items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={item.status === 'done'}
                        onChange={(event) =>
                          updateManualCustomElement(fileId, item.id, {
                            status: event.target.checked ? 'done' : 'todo'
                          })
                        }
                        className="mt-1 h-5 w-5"
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
              No extra manual tasks have been added.
            </p>
          )}

          <button
            type="button"
            onClick={() => setShowAddManualItem((value) => !value)}
            className="rounded-md border border-[rgba(24,43,73,0.25)] px-4 py-2 text-sm font-semibold text-[var(--ucsd-navy)] hover:bg-slate-50"
          >
            {showAddManualItem ? 'Hide task form' : 'Add another task'}
          </button>

          {showAddManualItem ? (
            <form onSubmit={addManualItem} className="grid gap-3 rounded-md border border-[rgba(24,43,73,0.14)] p-3 md:grid-cols-[minmax(0,1fr)_190px]">
              <label className="text-sm font-semibold text-[var(--ucsd-navy)]">
                Task
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
                  Add task
                </button>
              </div>
            </form>
          ) : null}
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
