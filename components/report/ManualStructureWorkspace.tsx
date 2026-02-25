'use client';

import { useEffect, useMemo, useState } from 'react';
import { detectHeadings, detectTables } from '@/lib/remediate/heuristics';
import { useAppStore } from '@/stores/app-store';

type TableDecision = 'confirm' | 'reject' | 'review';

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
  const parsed = file?.remediatedParsedData ?? file?.parsedData;

  const headingSuggestions = useMemo(() => (parsed ? detectHeadings(parsed) : []), [parsed]);
  const tableSuggestions = useMemo(() => (parsed ? detectTables(parsed) : []), [parsed]);
  const [includeHeadings, setIncludeHeadings] = useState<Record<string, boolean>>({});
  const [tableDecisions, setTableDecisions] = useState<Record<string, TableDecision>>({});

  useEffect(() => {
    const headingDefaults: Record<string, boolean> = {};
    for (let index = 0; index < headingSuggestions.length; index += 1) {
      const heading = headingSuggestions[index]!;
      headingDefaults[`h-${index}-${heading.page}-${heading.level}`] = true;
    }
    setIncludeHeadings(headingDefaults);

    const tableDefaults: Record<string, TableDecision> = {};
    for (let index = 0; index < tableSuggestions.length; index += 1) {
      const table = tableSuggestions[index]!;
      tableDefaults[`t-${index}-${table.page}`] = 'review';
    }
    setTableDecisions(tableDefaults);
  }, [headingSuggestions, tableSuggestions]);

  if (!parsed) {
    return (
      <section className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
        <h2>Manual Structure Workspace</h2>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">Process a file first to review heading and table suggestions.</p>
      </section>
    );
  }

  const selectedHeadings = headingSuggestions.filter((heading, index) => {
    const key = `h-${index}-${heading.page}-${heading.level}`;
    return includeHeadings[key];
  });

  const structurePlan = {
    generatedAt: new Date().toISOString(),
    documentName: file?.name ?? 'uploaded.pdf',
    base: file?.remediatedParsedData ? 'remediated' : 'original',
    existingOutlines: parsed.outlines,
    headingSuggestions: headingSuggestions.map((heading, index) => {
      const key = `h-${index}-${heading.page}-${heading.level}`;
      return {
        ...heading,
        includeInBookmarkPlan: Boolean(includeHeadings[key])
      };
    }),
    selectedBookmarkPlan: selectedHeadings,
    tableSuggestions: tableSuggestions.map((table, index) => {
      const key = `t-${index}-${table.page}`;
      return {
        page: table.page,
        rowCount: table.rows.length,
        columnCount: table.rows[0]?.cells.length ?? 0,
        decision: tableDecisions[key] ?? 'review'
      };
    })
  };

  return (
    <section className="space-y-3 rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
      <div>
        <h2>Manual Structure Workspace</h2>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">
          Review heading/bookmark and table suggestions before final manual tagging in Acrobat or PAC.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--ucsd-text)]">
        <span>Detected outlines: {parsed.outlines.length}</span>
        <span>Heading suggestions: {headingSuggestions.length}</span>
        <span>Table suggestions: {tableSuggestions.length}</span>
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
                const key = `h-${index}-${heading.page}-${heading.level}`;
                return (
                  <label key={key} className="flex items-start gap-2 rounded border border-[rgba(24,43,73,0.12)] p-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(includeHeadings[key])}
                      onChange={(event) =>
                        setIncludeHeadings((state) => ({
                          ...state,
                          [key]: event.target.checked
                        }))
                      }
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
                const key = `t-${index}-${table.page}`;
                const decision = tableDecisions[key] ?? 'review';
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
                        onClick={() => setTableDecisions((state) => ({ ...state, [key]: 'confirm' }))}
                      >
                        Confirm table
                      </button>
                      <button
                        type="button"
                        className={`rounded px-2 py-0.5 text-xs ${
                          decision === 'reject' ? 'bg-red-100 text-red-800' : 'border border-[rgba(24,43,73,0.2)] text-[var(--ucsd-text)]'
                        }`}
                        onClick={() => setTableDecisions((state) => ({ ...state, [key]: 'reject' }))}
                      >
                        Mark as non-table
                      </button>
                      <button
                        type="button"
                        className={`rounded px-2 py-0.5 text-xs ${
                          decision === 'review' ? 'bg-amber-100 text-amber-900' : 'border border-[rgba(24,43,73,0.2)] text-[var(--ucsd-text)]'
                        }`}
                        onClick={() => setTableDecisions((state) => ({ ...state, [key]: 'review' }))}
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
