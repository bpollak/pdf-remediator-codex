'use client';

import { useMemo } from 'react';
import { detectHeadings, detectTables } from '@/lib/remediate/heuristics';
import {
  buildStructurePlanHeadings,
  getStructureTableDecision,
  getTableDraftKey,
  summarizeManualReviewState
} from '@/lib/report/manual-review';
import { useAppStore } from '@/stores/app-store';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function downloadJson(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

const headingLevels = [1, 2, 3, 4, 5, 6] as const;

export function ManualStructureWorkspace({ fileId }: { fileId: string }) {
  const file = useAppStore((state) => state.files.find((entry) => entry.id === fileId));
  const markWorkflowProgress = useAppStore((state) => state.markWorkflowProgress);
  const updateStructureHeadingIncluded = useAppStore((state) => state.updateStructureHeadingIncluded);
  const updateStructureHeadingLevel = useAppStore((state) => state.updateStructureHeadingLevel);
  const moveStructureHeading = useAppStore((state) => state.moveStructureHeading);
  const resetStructureHeadingOrder = useAppStore((state) => state.resetStructureHeadingOrder);
  const updateStructureTableDraft = useAppStore((state) => state.updateStructureTableDraft);
  const parsed = file?.remediatedParsedData ?? file?.parsedData;

  const detectedHeadings = useMemo(() => (parsed ? detectHeadings(parsed) : []), [parsed]);
  const orderedHeadings = useMemo(
    () => buildStructurePlanHeadings(file, detectedHeadings),
    [detectedHeadings, file]
  );
  const tableSuggestions = useMemo(() => (parsed ? detectTables(parsed) : []), [parsed]);
  const summary = summarizeManualReviewState(file);

  if (!parsed) {
    return (
      <section className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
        <h2>Manual Structure Workspace</h2>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">Process a file first to review heading and table suggestions.</p>
      </section>
    );
  }

  const selectedHeadings = orderedHeadings.filter((heading) => heading.includeInBookmarkPlan);
  const structurePlan = {
    generatedAt: new Date().toISOString(),
    documentName: file?.name ?? 'uploaded.pdf',
    base: file?.remediatedParsedData ? 'remediated' : 'original',
    existingOutlines: parsed.outlines,
    headingSuggestions: orderedHeadings.map((heading, index) => ({
      key: heading.key,
      order: index + 1,
      page: heading.page,
      text: heading.text,
      detectedLevel: heading.level,
      editedLevel: heading.editedLevel,
      includeInBookmarkPlan: heading.includeInBookmarkPlan
    })),
    selectedBookmarkPlan: selectedHeadings.map((heading, index) => ({
      order: index + 1,
      page: heading.page,
      text: heading.text,
      level: heading.editedLevel
    })),
    tableSuggestions: tableSuggestions.map((table, index) => {
      const key = getTableDraftKey(table, index);
      return {
        page: table.page,
        rowCount: table.rows.length,
        columnCount: table.rows[0]?.cells.length ?? 0,
        decision: getStructureTableDecision(file, key)
      };
    })
  };

  return (
    <section className="space-y-3 rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
      <div>
        <h2>Structure Review</h2>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">
          A well-structured PDF has clear headings (like a table of contents) and properly marked tables. This helps screen readers navigate the document and present information in the right order.
        </p>
        <div className="mt-3 rounded-md border border-[rgba(0,98,155,0.15)] bg-[rgba(0,98,155,0.04)] p-3 text-sm text-[var(--ucsd-text)]">
          <p className="font-medium text-[var(--ucsd-navy)]">How this works:</p>
          <ol className="mt-1 ml-4 list-decimal space-y-1">
            <li>Review the <strong>headings</strong> we detected below. Check or uncheck each one to include it in your document&rsquo;s outline. You can also change the heading level (H1 is the main title, H2 is a section, H3 is a subsection, etc.).</li>
            <li>Review any <strong>tables</strong> we detected. Confirm each one is a real table, or mark it if it was incorrectly detected.</li>
            <li>When you are done reviewing, click <strong>Download structure plan</strong> to save your decisions.</li>
            <li>Open your PDF in Adobe Acrobat and update the headings and table tags using your downloaded plan as a guide.</li>
            <li>Upload the updated PDF in the &ldquo;Validate revised PDF&rdquo; step to confirm your changes.</li>
          </ol>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--ucsd-text)]">
        <span>{summary.structure.headingSuggestions} {summary.structure.headingSuggestions === 1 ? 'heading' : 'headings'} found</span>
        <span>{summary.structure.tableSuggestions} {summary.structure.tableSuggestions === 1 ? 'table' : 'tables'} found</span>
        {summary.structure.reviewedTables > 0 && (
          <span>({summary.structure.reviewedTables} of {summary.structure.tableSuggestions} tables reviewed)</span>
        )}
        {summary.pendingRevalidation ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
            Needs re-validation
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => {
            markWorkflowProgress(fileId, {
              structurePreparedAt: file?.workflowProgress?.structurePreparedAt ?? new Date().toISOString()
            });
            downloadJson(`${slugify(file?.name ?? 'document')}-structure-workspace.json`, structurePlan);
          }}
          className="rounded-md bg-[var(--ucsd-blue)] px-2.5 py-1 text-white hover:bg-[var(--ucsd-navy)]"
        >
          Download structure plan
        </button>
        {summary.structure.headingOrderCustomized ? (
          <button
            type="button"
            onClick={() => resetStructureHeadingOrder(fileId)}
            className="rounded-md border border-[rgba(24,43,73,0.25)] px-2.5 py-1 text-[var(--ucsd-text)] hover:bg-slate-50"
          >
            Reset heading order
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
        <article className="rounded border border-[rgba(24,43,73,0.15)] p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-[var(--ucsd-navy)]">Choose your headings</h4>
              <p className="mt-1 text-xs text-[var(--ucsd-text)]">
                Check or uncheck each heading to include it in your document&rsquo;s outline. You can also change the level or reorder them.
              </p>
            </div>
          </div>

          {orderedHeadings.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--ucsd-text)]">We did not find any headings in this document.</p>
          ) : (
            <div className="mt-3 max-h-[34rem] space-y-2 overflow-auto pr-1">
              {orderedHeadings.map((heading, index) => {
                const levelChanged = heading.editedLevel !== heading.level;
                return (
                  <div key={heading.key} className="rounded border border-[rgba(24,43,73,0.12)] p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={heading.includeInBookmarkPlan}
                          onChange={(event) =>
                            updateStructureHeadingIncluded(fileId, heading.key, event.target.checked)
                          }
                        />
                        <span className="text-[var(--ucsd-text)]">
                          <span className="font-medium text-[var(--ucsd-navy)]">
                            {index + 1}. {heading.text}
                          </span>
                          <span className="mt-1 block text-xs text-[var(--ucsd-text)]">
                            Page {heading.page} · Level {heading.level} heading
                            {levelChanged ? ` · changed to level ${heading.editedLevel}` : ''}
                          </span>
                        </span>
                      </label>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveStructureHeading(fileId, heading.key, 'up')}
                          disabled={index === 0}
                          className="rounded border border-[rgba(24,43,73,0.2)] px-2 py-1 text-xs text-[var(--ucsd-text)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Move up
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStructureHeading(fileId, heading.key, 'down')}
                          disabled={index === orderedHeadings.length - 1}
                          className="rounded border border-[rgba(24,43,73,0.2)] px-2 py-1 text-xs text-[var(--ucsd-text)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Move down
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--ucsd-text)]">
                        Change heading level
                      </label>
                      <select
                        value={heading.editedLevel === heading.level ? '' : String(heading.editedLevel)}
                        onChange={(event) =>
                          updateStructureHeadingLevel(
                            fileId,
                            heading.key,
                            event.target.value ? Number(event.target.value) : undefined
                          )
                        }
                        className="rounded border border-[rgba(24,43,73,0.2)] px-2 py-1 text-sm text-[var(--ucsd-text)]"
                      >
                        <option value="">Keep current level ({heading.level})</option>
                        {headingLevels.map((level) => (
                          <option key={level} value={level}>
                            Level {level}{level === 1 ? ' (main title)' : level === 2 ? ' (section)' : level === 3 ? ' (subsection)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>

        <div className="space-y-3">
          <article className="rounded border border-[rgba(24,43,73,0.15)] p-3">
            <h4 className="text-sm font-semibold text-[var(--ucsd-navy)]">Outline preview</h4>
            <p className="mt-1 text-xs text-[var(--ucsd-text)]">
              This shows how your document&rsquo;s table of contents will look based on your choices.
            </p>
            {selectedHeadings.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--ucsd-text)]">No headings are included yet. Check the boxes on the left to add headings to your outline.</p>
            ) : (
              <ol className="mt-3 space-y-2">
                {selectedHeadings.map((heading, index) => (
                  <li
                    key={heading.key}
                    className="rounded border border-[rgba(24,43,73,0.12)] bg-slate-50 py-2 pr-3"
                    style={{ paddingLeft: `${0.75 + (heading.editedLevel - 1) * 1.1}rem` }}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ucsd-text)]">
                      {index + 1}. Level {heading.editedLevel} heading · Page {heading.page}
                    </p>
                    <p className="mt-1 text-sm text-[var(--ucsd-navy)]">{heading.text}</p>
                  </li>
                ))}
              </ol>
            )}
          </article>

          <article className="rounded border border-[rgba(24,43,73,0.15)] p-3">
            <h4 className="text-sm font-semibold text-[var(--ucsd-navy)]">Review detected tables</h4>
            <p className="mt-1 text-xs text-[var(--ucsd-text)]">
              We found what looks like tables in your document. For each one, confirm it is a real table, mark it if it was detected incorrectly, or flag it for later review.
            </p>
            {tableSuggestions.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--ucsd-text)]">No tables were found in this document.</p>
            ) : (
              <div className="mt-2 max-h-[24rem] space-y-2 overflow-auto pr-1">
                {tableSuggestions.map((table, index) => {
                  const key = getTableDraftKey(table, index);
                  const decision = getStructureTableDecision(file, key);
                  return (
                    <div key={key} className="rounded border border-[rgba(24,43,73,0.12)] p-2 text-sm">
                      <p className="font-medium text-[var(--ucsd-navy)]">
                        Table on page {table.page} ({table.rows.length} rows, {table.rows[0]?.cells.length ?? 0} columns)
                      </p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={`rounded px-2 py-0.5 text-xs ${
                            decision === 'confirm'
                              ? 'bg-green-100 text-green-800'
                              : 'border border-[rgba(24,43,73,0.2)] text-[var(--ucsd-text)]'
                          }`}
                          onClick={() => updateStructureTableDraft(fileId, key, 'confirm')}
                        >
                          Yes, this is a table
                        </button>
                        <button
                          type="button"
                          className={`rounded px-2 py-0.5 text-xs ${
                            decision === 'reject'
                              ? 'bg-red-100 text-red-800'
                              : 'border border-[rgba(24,43,73,0.2)] text-[var(--ucsd-text)]'
                          }`}
                          onClick={() => updateStructureTableDraft(fileId, key, 'reject')}
                        >
                          Not a table
                        </button>
                        <button
                          type="button"
                          className={`rounded px-2 py-0.5 text-xs ${
                            decision === 'review'
                              ? 'bg-amber-100 text-amber-900'
                              : 'border border-[rgba(24,43,73,0.2)] text-[var(--ucsd-text)]'
                          }`}
                          onClick={() => updateStructureTableDraft(fileId, key, 'review')}
                        >
                          Not sure — review later
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </article>
        </div>
      </div>
    </section>
  );
}
