'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { HelpTip } from '@/components/report/HelpTip';
import { PdfRegionThumbnail } from '@/components/report/PdfRegionThumbnail';
import { ResultsChanges } from '@/components/report/ResultsChanges';
import { NeedHelpBox } from '@/components/report/NeedHelpBox';
import { SUGGEST_DESCRIPTION_PRIVACY_NOTE } from '@/lib/content/privacy';
import { renderPdfRegionToDataUrl } from '@/lib/pdf/renderer';
import { detectTables } from '@/lib/remediate/heuristics';
import { getAccessibilityStatus, getPublishReadiness } from '@/lib/report/accessibility-status';
import { redactDiagnostic } from '@/lib/report/diagnostics';
import {
  getAltTextDraftForImage,
  getManualReviewDrafts,
  getRequiredChecklistItems,
  getReviewableImages,
  getStructureTableDecision,
  getTableDraftKey,
  summarizeManualCompletion,
  type ChecklistWorkflowProgress
} from '@/lib/report/manual-review';
import { useAppStore } from '@/stores/app-store';
import type { ManualCustomElementCategory } from '@/types/file-entry';

type SuggestionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; alt: string; decorative: boolean }
  | { status: 'error'; message: string; detail?: string };

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

const DESCRIPTION_SAVE_DELAY_MS = 400;

/**
 * Image description textarea. Typing stays local and is saved shortly after
 * the user pauses (and on blur), instead of writing the store and browser
 * storage on every keystroke.
 */
function DescriptionField({
  value,
  onSave,
  disabled,
  labelledBy
}: {
  value: string;
  onSave: (value: string) => void;
  disabled: boolean;
  labelledBy: string;
}) {
  const [draft, setDraft] = useState(value);
  const pending = useRef<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  // Take outside changes (for example "Use suggestion") when nothing is pending.
  useEffect(() => {
    if (pending.current === undefined) setDraft(value);
  }, [value]);

  function flush() {
    clearTimeout(timer.current);
    if (pending.current === undefined) return;
    const next = pending.current;
    pending.current = undefined;
    saveRef.current(next);
  }

  useEffect(() => flush, []);

  return (
    <textarea
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        pending.current = event.target.value;
        clearTimeout(timer.current);
        timer.current = setTimeout(flush, DESCRIPTION_SAVE_DELAY_MS);
      }}
      onBlur={flush}
      disabled={disabled}
      rows={3}
      aria-labelledby={labelledBy}
      placeholder="Write the image description"
      className="mt-2 w-full rounded-md border border-[rgba(24,43,73,0.2)] p-2 text-sm disabled:bg-slate-100"
    />
  );
}

function manualStatusLabel(remaining: number) {
  if (remaining === 0) return 'Checklist complete';
  if (remaining === 1) return '1 checklist item left';
  return `${remaining} checklist items left`;
}

const statusToneClasses: Record<ReturnType<typeof getAccessibilityStatus>['status'], string> = {
  accessible: 'border-green-200 bg-green-50',
  'not-yet-accessible': 'border-amber-200 bg-amber-50',
  'verification-unavailable': 'border-amber-200 bg-amber-50',
  processing: 'border-[rgba(0,98,155,0.25)] bg-[rgba(0,98,155,0.06)]'
};

/**
 * A required checklist item ticked by the user once they have made the fix
 * outside the app. The title is the checkbox's name; the instructions are its
 * description.
 */
function RequiredItem({
  title,
  done,
  onChange,
  children,
  detail
}: {
  title: string;
  done: boolean;
  onChange: (done: boolean) => void;
  children: ReactNode;
  detail?: string;
}) {
  const id = useId();
  return (
    <article
      className={`rounded-md border p-3 ${done ? 'border-green-200 bg-green-50' : 'border-[rgba(24,43,73,0.14)]'}`}
    >
      <div className="flex items-start gap-3 text-sm">
        <input
          id={`${id}-input`}
          type="checkbox"
          checked={done}
          onChange={(event) => onChange(event.target.checked)}
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-description`}
          className="mt-1 h-5 w-5 shrink-0 cursor-pointer"
        />
        <div className="min-w-0">
          <label
            id={`${id}-title`}
            htmlFor={`${id}-input`}
            className="block cursor-pointer break-words font-semibold text-[var(--ucsd-navy)]"
          >
            {title}
          </label>
          <div id={`${id}-description`} className="mt-1 space-y-1 leading-relaxed text-[var(--ucsd-text)]">
            {detail ? <p>{detail}</p> : null}
            <p>{children}</p>
          </div>
          <p className="mt-2 text-xs font-semibold text-[var(--ucsd-text)]">
            {done ? 'Done' : 'Required before publishing. Tick this once you have made the fix.'}
          </p>
        </div>
      </div>
    </article>
  );
}

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
  const [downloadNotice, setDownloadNotice] = useState('');

  const parsed = file?.remediatedParsedData ?? file?.parsedData;
  const sourceBytes = file?.remediatedParsedData ? file?.remediatedBytes ?? file?.uploadedBytes : file?.uploadedBytes;
  const completion = summarizeManualCompletion(file);
  const drafts = getManualReviewDrafts(file);
  const remaining = Math.max(completion.total - completion.completed, 0);
  const manualStructureRequired = file?.remediationMode === 'analysis-only';
  const manualStructureDone = Boolean(file?.workflowProgress?.structureConfirmedAt);
  const requiredItems = getRequiredChecklistItems(file);
  const revalidationHref = file ? `/app?revalidateFor=${encodeURIComponent(file.id)}#upload-revised-pdf` : '/app';

  const imageEntries = useMemo(() => {
    const images = [...getReviewableImages(file, parsed)].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
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
  }, [drafts.altText, file, parsed]);

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
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Revoking straight after click() can cancel the download in Safari.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    markWorkflowProgress(fileId, {
      downloadedAt: file?.workflowProgress?.downloadedAt ?? new Date().toISOString()
    });
    // Clear first so a second download of the same file is announced again.
    setDownloadNotice('');
    setTimeout(() => setDownloadNotice(`Downloaded ${name}. Check your Downloads folder.`), 100);
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

  function setChecklistItemDone(itemId: string, done: boolean) {
    const doneAt = {
      ...((file?.workflowProgress as ChecklistWorkflowProgress | undefined)?.checklistItemsDoneAt ?? {})
    };
    if (done) doneAt[itemId] = doneAt[itemId] ?? new Date().toISOString();
    else delete doneAt[itemId];
    const patch: Partial<ChecklistWorkflowProgress> = { checklistItemsDoneAt: doneAt };
    markWorkflowProgress(fileId, patch);
  }

  function setManualStructureDone(done: boolean) {
    markWorkflowProgress(fileId, {
      structureConfirmedAt: done ? file?.workflowProgress?.structureConfirmedAt ?? new Date().toISOString() : undefined
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
        const baseMessage = typeof payload.error === 'string' ? payload.error : `Request failed (${response.status}).`;
        const hint = typeof payload.hint === 'string' ? ` ${payload.hint}` : '';
        throw new Error(`${baseMessage}${hint}`);
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
          message: "We couldn't suggest a description right now. You can still write it yourself below.",
          detail: redactDiagnostic(error instanceof Error ? error.message : undefined)
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

  const readiness = getPublishReadiness(file);
  const { reasons: checkReasons, detail: verificationDetail } = getAccessibilityStatus(file);
  const hasSavedDescriptions = savedDescriptionDrafts.length > 0;
  const manualFixRequired = manualStructureRequired || requiredItems.length > 0;
  const ocrSupportDetail = file.ocrAttempted && !file.ocrApplied ? redactDiagnostic(file.ocrReason) : undefined;
  const reportHref = `/app/${encodeURIComponent(file.id)}`;
  const nextStepTitle =
    remaining > 0
      ? 'Finish the checklist'
      : hasSavedDescriptions
        ? 'Download the PDF with descriptions'
        : 'Download the updated PDF';
  const nextStepDescription =
    remaining > 0
      ? 'Work through the checklist below. When it is complete, download the best available PDF and upload your revised file for a final check.'
      : hasSavedDescriptions
        ? 'Your image descriptions are saved. Download the PDF that includes them, then upload that revised file to check it again.'
        : readiness.blocker === 'none'
          ? 'Download the updated PDF, then give it a final look before you publish.'
          : 'Download the updated PDF. The status above says what still needs to happen before you publish.';

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="break-words">Finish your PDF</h1>
        <p className="break-words text-sm text-[var(--ucsd-text)]">{file.name}</p>
      </div>

      <section
        aria-labelledby="readiness-heading"
        className={`rounded-lg border p-5 shadow-sm ${statusToneClasses[readiness.status]}`}
      >
        <h2 id="readiness-heading">Is this PDF ready to publish?</h2>
        <p className="mt-2 text-2xl font-semibold text-[var(--ucsd-navy)]">{readiness.verdict}</p>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--ucsd-text)]">
          {readiness.message}
          {readiness.blocker === 'analysis-only' ? (
            <HelpTip label="tags">
              Tags are hidden labels inside a PDF that tell screen readers what each part is (a heading, a list, a
              table, an image) and the order to read it in. Without them, a screen reader can&apos;t read the PDF
              properly.
            </HelpTip>
          ) : null}
        </p>
        {file.ocrAttempted && !file.ocrApplied ? (
          <div className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ucsd-text)]">
            <p>
              <span className="font-semibold">Scanned document:</span> we couldn&apos;t read the text in this scan,
              so screen readers can&apos;t read it either. The checklist below shows how to fix this.
            </p>
            {ocrSupportDetail ? (
              <details className="mt-1">
                <summary className="cursor-pointer font-semibold text-[var(--ucsd-navy)]">Details for support</summary>
                <p className="mt-1 break-words">{ocrSupportDetail}</p>
              </details>
            ) : null}
          </div>
        ) : null}
        {readiness.blocker === 'verification-unavailable' && verificationDetail ? (
          <details className="mt-3 max-w-2xl text-sm text-[var(--ucsd-text)]">
            <summary className="cursor-pointer font-semibold text-[var(--ucsd-navy)]">Details for support</summary>
            <p className="mt-1 break-words">{verificationDetail}</p>
          </details>
        ) : null}
        {readiness.status !== 'processing' && checkReasons.length > 0 ? (
          <details className="mt-3 max-w-2xl text-sm text-[var(--ucsd-text)]">
            <summary className="cursor-pointer font-semibold text-[var(--ucsd-navy)]">
              Show automated check details
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {checkReasons.map((reason) => (
                <li key={`${reason.code}-${reason.label}`}>{reason.label}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section
        aria-labelledby="next-step-heading"
        className="rounded-lg border border-[rgba(24,43,73,0.18)] bg-white p-5 shadow-sm"
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ucsd-text)]">Next step</p>
            <h2 id="next-step-heading" className="mt-1">
              {nextStepTitle}
            </h2>
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
                role="status"
                className={`mt-3 max-w-2xl rounded-md border p-3 text-sm ${
                  applyState.downloaded
                    ? 'border-green-200 bg-green-50 text-green-900'
                    : 'border-amber-200 bg-amber-50 text-amber-950'
                }`}
              >
                {applyState.downloaded ? (
                  <p>
                    Embedded all {applyState.applied} {applyState.applied === 1 ? 'description' : 'descriptions'} into
                    the downloaded PDF. To re-check it,{' '}
                    <Link href={revalidationHref} className="font-semibold underline">
                      upload the downloaded file
                    </Link>
                    .
                  </p>
                ) : (
                  <p>
                    Could not embed every saved image description. {applyState.applied} of {applyState.expected}{' '}
                    {applyState.expected === 1 ? 'description was' : 'descriptions were'} embedded, so no partial PDF
                    was downloaded.
                  </p>
                )}
                {applyState.skipped.length > 0 ? (
                  <p className="mt-1 text-amber-900">
                    {applyState.skipped.length} {applyState.skipped.length === 1 ? 'image' : 'images'} still need Acrobat:{' '}
                    {[...new Set(applyState.skipped.map((item) => item.reason))].join(' ')}
                  </p>
                ) : null}
              </div>
            ) : null}
            {applyState.status === 'error' ? (
              <p role="alert" className="mt-3 max-w-2xl rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {applyState.message}
              </p>
            ) : null}
            <p aria-live="polite" className="mt-3 max-w-2xl text-sm font-medium text-[var(--ucsd-navy)] empty:hidden">
              {downloadNotice}
            </p>
            {remaining === 0 ? (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ucsd-text)]">
                {savedDescriptionDrafts.length > 0
                  ? 'Use the description download when you want the saved image descriptions embedded into the PDF. Table decisions and other manual edits still need Acrobat or the source document.'
                  : 'This download contains the automated fixes the app could safely make.'}
              </p>
            ) : null}
          </div>
          <div className="rounded-md border border-[rgba(24,43,73,0.14)] bg-slate-50 p-4">
            <p id="checklist-progress-label" className="text-sm font-semibold text-[var(--ucsd-navy)]">
              Checklist progress
            </p>
            <p className="mt-1 text-3xl font-semibold text-[var(--ucsd-navy)]">{completion.percent}%</p>
            <div
              className="mt-3 h-2 rounded-full border border-slate-500 bg-white"
              role="progressbar"
              aria-labelledby="checklist-progress-label"
              aria-valuenow={completion.percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full rounded-full bg-[var(--ucsd-blue)]" style={{ width: `${completion.percent}%` }} />
            </div>
            <p className="mt-3 text-sm text-[var(--ucsd-text)]">{manualStatusLabel(remaining)}</p>
          </div>
        </div>
      </section>

      <ResultsChanges file={file} reportHref={reportHref} />

      {manualFixRequired ? <NeedHelpBox /> : null}

      <section
        id="manual-checklist"
        aria-labelledby="manual-checklist-heading"
        className="space-y-4 rounded-lg border border-[rgba(24,43,73,0.18)] bg-white p-5 shadow-sm"
      >
        <div>
          <h2 id="manual-checklist-heading">Manual checklist</h2>
          <p className="mt-1 text-sm text-[var(--ucsd-text)]">
            Complete each item that applies to this PDF. The progress meter updates as you save descriptions,
            confirm tables, or tick items done.
          </p>
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p>
              <span className="font-semibold">How to finish:</span>
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Save any image descriptions, or mark decorative images so screen readers can skip them.</li>
              <li>
                For items marked &ldquo;Required before publishing&rdquo;, make the fix in the source file or Acrobat
                Pro, then tick the item.
              </li>
              <li>
                Download the best available PDF, make any desktop edits, then upload the revised PDF so we can check
                it again.
              </li>
            </ol>
          </div>
        </div>

        {manualStructureRequired || requiredItems.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-[var(--ucsd-navy)]">Fixes to make outside this app</h3>
            {manualStructureRequired ? (
              <RequiredItem
                title="Add the hidden structure (tags) screen readers need"
                done={manualStructureDone}
                onChange={setManualStructureDone}
              >
                The easiest way is to go back to the source file (Word, PowerPoint, Google Docs) and export it again as
                a tagged PDF. Otherwise, add tags in Acrobat Pro, including heading order, reading order and table
                structure.
              </RequiredItem>
            ) : null}
            {requiredItems.map((item) => (
              <RequiredItem
                key={item.id}
                title={item.title}
                detail={item.detail}
                done={item.done}
                onChange={(done) => setChecklistItemDone(item.id, done)}
              >
                {item.instructions}
              </RequiredItem>
            ))}
          </div>
        ) : null}

        {imageEntries.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-[var(--ucsd-navy)]">Image descriptions</h3>
            <p id="suggest-privacy-note" className="text-sm text-[var(--ucsd-text)]">
              {SUGGEST_DESCRIPTION_PRIVACY_NOTE}
            </p>
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
                        <h4 id={`image-heading-${entry.image.id}`} className="font-semibold text-[var(--ucsd-navy)]">
                          {entry.label} on page {entry.image.page}
                        </h4>
                        <button
                          type="button"
                          onClick={() => suggestAltText(entry)}
                          disabled={suggestion.status === 'loading'}
                          aria-describedby="suggest-privacy-note"
                          className="rounded-md border border-[rgba(24,43,73,0.25)] px-3 py-1.5 text-xs font-medium text-[var(--ucsd-text)] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {suggestion.status === 'loading' ? 'Suggesting...' : 'Suggest description'}
                        </button>
                      </div>
                      {suggestion.status === 'ready' ? (
                        <div role="status" className="mt-2 rounded-md border border-green-200 bg-green-50 p-2 text-sm text-green-900">
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
                        <div role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">
                          <p>{suggestion.message}</p>
                          {suggestion.detail ? (
                            <details className="mt-1">
                              <summary className="cursor-pointer font-semibold">Details for support</summary>
                              <p className="mt-1 break-words">{suggestion.detail}</p>
                            </details>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="mt-3 flex items-center gap-2 text-sm text-[var(--ucsd-text)]">
                        <label className="flex cursor-pointer items-center gap-2 py-1">
                          <input
                            type="checkbox"
                            checked={entry.draft.decorative}
                            // Keep the description, so an accidental tick doesn't erase it.
                            onChange={(event) => saveAltText(entry.image.id, entry.draft.alt, event.target.checked)}
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
                      <DescriptionField
                        value={entry.draft.alt}
                        onSave={(alt) => saveAltText(entry.image.id, alt, false)}
                        disabled={entry.draft.decorative}
                        labelledBy={`image-heading-${entry.image.id}`}
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
                      aria-pressed={table.decision === 'confirm'}
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
                      aria-pressed={table.decision === 'reject'}
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
