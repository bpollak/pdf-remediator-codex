'use client';

import { useEffect, useMemo } from 'react';
import { buildEvidencePack } from '@/lib/report/evidence-pack';
import { useAppStore } from '@/stores/app-store';

export function CompareActions({ fileId }: { fileId: string }) {
  const file = useAppStore((s) => s.files.find((entry) => entry.id === fileId));
  const remediatedBytes = file?.remediatedBytes;

  const blobUrl = useMemo(() => {
    if (!remediatedBytes) return null;
    return URL.createObjectURL(new Blob([remediatedBytes], { type: 'application/pdf' }));
  }, [remediatedBytes]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const downloadName = file ? `remediated-${file.name}` : 'remediated.pdf';

  function downloadEvidencePack() {
    if (!file) return;
    const payload = buildEvidencePack(file);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${file.name.replace(/\.pdf$/i, '')}-qa-evidence-pack.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
      <h2>Download Your Updated PDF</h2>
      <p className="mt-1 text-sm text-[var(--ucsd-text)]">
        Use this file for manual review and publishing once your remaining checklist items are complete.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <a
          href={blobUrl ?? undefined}
          download={downloadName}
          className={`inline-flex items-center rounded-md px-4 py-2 text-sm font-medium text-white transition ${
            blobUrl ? 'bg-[var(--ucsd-blue)] hover:bg-[var(--ucsd-navy)]' : 'pointer-events-none bg-gray-300'
          }`}
          aria-disabled={!blobUrl}
        >
          Download remediated PDF
        </a>
        <a
          href={blobUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          className={`text-sm ${blobUrl ? 'text-[var(--ucsd-blue)] hover:underline' : 'pointer-events-none text-gray-400'}`}
          aria-disabled={!blobUrl}
        >
          Open remediated PDF
        </a>
        <button
          type="button"
          onClick={downloadEvidencePack}
          className="inline-flex items-center rounded-md border border-[rgba(24,43,73,0.25)] px-4 py-2 text-sm font-medium text-[var(--ucsd-text)] hover:bg-slate-50"
        >
          Download QA evidence pack (JSON)
        </button>
      </div>
    </section>
  );
}
