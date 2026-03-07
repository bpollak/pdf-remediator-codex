'use client';

import { useMemo } from 'react';
import { detectHeadings, detectTables } from '@/lib/remediate/heuristics';
import { useAppStore } from '@/stores/app-store';
import {
  getHeadingDraftKey,
  getStructureHeadingIncluded,
  getStructureTableDecision,
  getTableDraftKey,
  summarizeManualReviewState
} from '@/lib/report/manual-review';

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

export function ManualStructureWorkspace({ fileId }: { fileId: string }) {
  const file = useAppStore((state) => state.files.find((entry) => entry.id === fileId));
  const updateStructureHeadingDraft = useAppStore((state) => state.updateStructureHeadingDraft);
  const updateStructureTableDraft = useAppStore((state) => state.updateStructureTableDraft);
  const parsed = file?.remediatedParsedData ?? file?.parsedData;

  const headingSuggestions = useMemo(() => (parsed ? detectHeadings(parsed) : []), [parsed]);
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

  const selectedHeadings = headingSuggestions.filter((heading, index) => {
    const key = getHeadingDraftKey(heading, index);
    return getStructureHeadingIncluded(file, key);
  });

  const structurePlan = {
    generatedAt: new Date().toISOString(),
    documentName: file?.name ?? 'uploaded.pdf',
    base: file?.remediatedParsedData ? 'remediated' : 'original',
    existingOutlines: parsed.outlines,
    headingSuggestions: headingSuggestions.map((heading, index) => {
      const key = getHeadingDraftKey(heading, index);
      return {
        ...heading,
        includeInBookmarkPlan: getStructureHeadingIncluded(file, key)
      };
    }),
    selectedBookmarkPlan: selectedHeadings,
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
          Review heading, bookmark, and table suggestions before final manual tagging in Acrobat or PAC.
        </p>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">
          This workspace creates a persisted review plan. It does not directly rewrite the PDF tag tree or change the automated baseline.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--ucsd-text)]">
        <span>Detected outlines: {parsed.outlines.length}</span>
        <span>Heading suggestions: {summary.structure.headingSuggestions}</span>
        <span>Heading overrides: {summary.structure.headingOverrides}</span>
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
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded border border-[rgba(24,43,73,0.15)] p-3">
          <h4 className="text-sm font-semibold text-[var(--ucsd-navy)]">Heading and bookmark candidates</h4>
          {headingSuggestions.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--ucsd-text)]">No heading candidates detected.</p>
          ) : (
            <div className="mt-2 max-h-[28vh] space-y-2 overflow-auto pr-1">
              {headingSuggestions.map((heading, index) => {
                const key = getHeadingDraftKey(heading, index);
                return (
                  <label key={key} className="flex items-start gap-2 rounded border border-[rgba(24,43,73,0.12)] p-2 text-sm">
                    <input
                      type="checkbox"
                      checked={getStructureHeadingIncluded(file, key)}
                      onChange={(event) => updateStructureHeadingDraft(fileId, key, event.target.checked)}
                    />
                    <span className="text-[var(--ucsd-text)]">
                      <span className="font-medium text-[var(--ucsd-navy)]">H{heading.level}</span> p.{heading.page}: {heading.text}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </article>

        <article className="rounded border border-[rgba(24,43,73,0.15)] p-3">
          <h4 className="text-sm font-semibold text-[var(--ucsd-navy)]">Table confidence review</h4>
          {tableSuggestions.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--ucsd-text)]">No table candidates detected.</p>
          ) : (
            <div className="mt-2 max-h-[28vh] space-y-2 overflow-auto pr-1">
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
                          decision === 'confirm' ? 'bg-green-100 text-green-800' : 'border border-[rgba(24,43,73,0.2)] text-[var(--ucsd-text)]'
                        }`}
                        onClick={() => updateStructureTableDraft(fileId, key, 'confirm')}
                      >
                        Confirm table
                      </button>
                      <button
                        type="button"
                        className={`rounded px-2 py-0.5 text-xs ${
                          decision === 'reject' ? 'bg-red-100 text-red-800' : 'border border-[rgba(24,43,73,0.2)] text-[var(--ucsd-text)]'
                        }`}
                        onClick={() => updateStructureTableDraft(fileId, key, 'reject')}
                      >
                        Mark as non-table
                      </button>
                      <button
                        type="button"
                        className={`rounded px-2 py-0.5 text-xs ${
                          decision === 'review' ? 'bg-amber-100 text-amber-900' : 'border border-[rgba(24,43,73,0.2)] text-[var(--ucsd-text)]'
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
    </section>
  );
}
