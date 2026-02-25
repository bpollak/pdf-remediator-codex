'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/stores/app-store';

type AltDraft = {
  alt: string;
  decorative: boolean;
};

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

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function AltTextWorkspace({ fileId }: { fileId: string }) {
  const file = useAppStore((state) => state.files.find((entry) => entry.id === fileId));
  const parsed = file?.remediatedParsedData ?? file?.parsedData;
  const images = useMemo(
    () => [...(parsed?.images ?? [])].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x),
    [parsed?.images]
  );
  const [showMissingOnly, setShowMissingOnly] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, AltDraft>>({});

  useEffect(() => {
    const nextDrafts: Record<string, AltDraft> = {};
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index]!;
      const key = `${image.id}-${index}`;
      nextDrafts[key] = {
        alt: image.alt ?? '',
        decorative: Boolean(image.decorative)
      };
    }
    setDrafts(nextDrafts);
  }, [images]);

  const entries = useMemo(
    () =>
      images.map((image, index) => {
        const key = `${image.id}-${index}`;
        const draft = drafts[key] ?? { alt: image.alt ?? '', decorative: Boolean(image.decorative) };
        const needsAlt = !draft.decorative && draft.alt.trim().length === 0;
        return { key, image, draft, needsAlt };
      }),
    [drafts, images]
  );

  const visibleEntries = showMissingOnly ? entries.filter((entry) => entry.needsAlt) : entries;
  const missingCount = entries.filter((entry) => entry.needsAlt).length;

  const worksheetPayload = useMemo(
    () => ({
      generatedAt: new Date().toISOString(),
      documentName: file?.name ?? 'uploaded.pdf',
      base: file?.remediatedParsedData ? 'remediated' : 'original',
      images: entries.map((entry) => ({
        id: entry.image.id,
        page: entry.image.page,
        x: Math.round(entry.image.x),
        y: Math.round(entry.image.y),
        width: Math.round(entry.image.width),
        height: Math.round(entry.image.height),
        decorative: entry.draft.decorative,
        alt: entry.draft.alt.trim()
      }))
    }),
    [entries, file?.name, file?.remediatedParsedData]
  );

  function exportJson() {
    const safeName = slugify(file?.name ?? 'document');
    downloadTextFile(`${safeName}-alt-text-worksheet.json`, JSON.stringify(worksheetPayload, null, 2));
  }

  function exportCsv() {
    const safeName = slugify(file?.name ?? 'document');
    const header = ['id', 'page', 'x', 'y', 'width', 'height', 'decorative', 'alt'];
    const rows = worksheetPayload.images.map((image) =>
      [
        image.id,
        String(image.page),
        String(image.x),
        String(image.y),
        String(image.width),
        String(image.height),
        image.decorative ? 'true' : 'false',
        image.alt
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
          Review detected images, draft alt text, mark decorative images, and export a worksheet for remediation.
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
          Missing alt coverage: {missingCount} of {entries.length}
        </span>
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
        <div className="max-h-[40vh] space-y-2 overflow-auto pr-1">
          {visibleEntries.map((entry) => (
            <article key={entry.key} className="rounded border border-[rgba(24,43,73,0.15)] p-3">
              <p className="text-sm font-medium text-[var(--ucsd-navy)]">
                {entry.image.id} (Page {entry.image.page})
              </p>
              <p className="mt-1 text-xs text-[var(--ucsd-text)]">
                Bounds: x {Math.round(entry.image.x)}, y {Math.round(entry.image.y)}, w {Math.round(entry.image.width)}, h{' '}
                {Math.round(entry.image.height)}
              </p>
              <label className="mt-2 flex items-center gap-2 text-xs text-[var(--ucsd-text)]">
                <input
                  type="checkbox"
                  checked={entry.draft.decorative}
                  onChange={(event) =>
                    setDrafts((state) => ({
                      ...state,
                      [entry.key]: {
                        ...entry.draft,
                        decorative: event.target.checked
                      }
                    }))
                  }
                />
                Mark as decorative
              </label>
              <textarea
                value={entry.draft.alt}
                onChange={(event) =>
                  setDrafts((state) => ({
                    ...state,
                    [entry.key]: {
                      ...entry.draft,
                      alt: event.target.value
                    }
                  }))
                }
                rows={2}
                placeholder={entry.draft.decorative ? 'Decorative image (alt not required)' : 'Describe what this image communicates'}
                className="mt-2 w-full rounded border border-[rgba(24,43,73,0.2)] p-2 text-sm"
                disabled={entry.draft.decorative}
              />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
