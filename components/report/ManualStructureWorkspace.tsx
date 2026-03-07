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
        <h2>Manual Structure Workspace</h2>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">
          Review heading, bookmark, and table suggestions. You can change heading level and order here before applying
          the final PDF tags in Acrobat or PAC.
        </p>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">
          These edits persist as a review plan. They do not directly rewrite the PDF tag tree or update the automated
          baseline until you validate a revised PDF.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--ucsd-text)]">
        <span>Detected outlines: {parsed.outlines.length}</span>
        <span>Heading suggestions: {summary.structure.headingSuggestions}</span>
        <span>Structure edits saved: {summary.structure.headingOverrides}</span>
        <span>Table suggestions: {summary.structure.tableSuggestions}</span>
        <span>Table decisions reviewed: {summary.structure.reviewedTables} of {summary.structure.tableSuggestions}</span>
        {summary.pendingRevalidation ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
            Pending re-validation
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => downloadJson(`${slugify(file?.name ?? 'document')}-structure-workspace.json`, structurePlan)}
          className="rounded-md bg-[var(--ucsd-blue)] px-2.5 py-1 text-white hover:bg-[var(--ucsd-navy)]"
        >
          Export structure plan
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
              <h4 className="text-sm font-semibold text-[var(--ucsd-navy)]">Heading and bookmark plan</h4>
              <p className="mt-1 text-xs text-[var(--ucsd-text)]">
                Include or exclude candidates, change the intended heading level, and reorder the reading outline.
              </p>
            </div>
          </div>

          {orderedHeadings.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--ucsd-text)]">No heading candidates detected.</p>
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
                            Page {heading.page} · detected as H{heading.level}
                            {levelChanged ? ` · edited to H${heading.editedLevel}` : ''}
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
                        Intended heading level
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
                        <option value="">Use detected level (H{heading.level})</option>
                        {headingLevels.map((level) => (
                          <option key={level} value={level}>
                            H{level}
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
            <h4 className="text-sm font-semibold text-[var(--ucsd-navy)]">Hierarchy preview</h4>
            <p className="mt-1 text-xs text-[var(--ucsd-text)]">
              This is the intended heading outline after your saved edits.
            </p>
            {selectedHeadings.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--ucsd-text)]">No headings are currently included in the review plan.</p>
            ) : (
              <ol className="mt-3 space-y-2">
                {selectedHeadings.map((heading, index) => (
                  <li
                    key={heading.key}
                    className="rounded border border-[rgba(24,43,73,0.12)] bg-slate-50 py-2 pr-3"
                    style={{ paddingLeft: `${0.75 + (heading.editedLevel - 1) * 1.1}rem` }}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ucsd-text)]">
                      {index + 1}. H{heading.editedLevel} · Page {heading.page}
                    </p>
                    <p className="mt-1 text-sm text-[var(--ucsd-navy)]">{heading.text}</p>
                  </li>
                ))}
              </ol>
            )}
          </article>

          <article className="rounded border border-[rgba(24,43,73,0.15)] p-3">
            <h4 className="text-sm font-semibold text-[var(--ucsd-navy)]">Table confidence review</h4>
            {tableSuggestions.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--ucsd-text)]">No table candidates detected.</p>
            ) : (
              <div className="mt-2 max-h-[24rem] space-y-2 overflow-auto pr-1">
                {tableSuggestions.map((table, index) => {
                  const key = getTableDraftKey(table, index);
                  const decision = getStructureTableDecision(file, key);
                  return (
                    <div key={key} className="rounded border border-[rgba(24,43,73,0.12)] p-2 text-sm">
                      <p className="font-medium text-[var(--ucsd-navy)]">
                        Page {table.page}: {table.rows.length} rows x {table.rows[0]?.cells.length ?? 0} columns
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
                          Confirm table
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
                          Mark as non-table
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
                          Needs review
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
