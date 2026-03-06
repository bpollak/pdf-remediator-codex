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

  return (
    <section className="rounded border-2 border-[rgba(0,98,155,0.25)] bg-[rgba(0,98,155,0.04)] p-5 shadow-sm">
      <h2 className="text-2xl font-semibold leading-tight text-[var(--ucsd-navy)]">Download Your Updated PDF</h2>
      <p className="mt-1 text-sm text-[var(--ucsd-text)]">
        Use this app for first-pass remediation and review. After download, continue final tag editing and desktop validation in Acrobat or PAC before publishing.
      </p>
      <p className="mt-1 text-sm text-[var(--ucsd-text)]">
        Open the review sections below when you need troubleshooting context, manual follow-up guidance, or QA evidence.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href={blobUrl ?? undefined}
          download={downloadName}
          className={`inline-flex items-center rounded-md px-4 py-2.5 text-sm font-semibold text-white transition ${
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
          className={`inline-flex items-center rounded-md border px-4 py-2.5 text-sm font-semibold transition ${
            blobUrl
              ? 'border-[rgba(24,43,73,0.35)] text-[var(--ucsd-navy)] hover:bg-white'
              : 'pointer-events-none border-gray-300 text-gray-400'
          }`}
          aria-disabled={!blobUrl}
        >
          Open remediated PDF in new tab
        </a>
      </div>
    </section>
  );
}

export function EvidencePackAction({ fileId }: { fileId: string }) {
  const file = useAppStore((s) => s.files.find((entry) => entry.id === fileId));
  const hasEvidencePack = Boolean(file);

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
      <h3>QA evidence pack</h3>
      <p className="mt-1 text-sm text-[var(--ucsd-text)]">
        Download a JSON snapshot of findings, structure metrics, and verification outcomes for reporting and audits.
      </p>
      <button
        type="button"
        onClick={downloadEvidencePack}
        disabled={!hasEvidencePack}
        className={`mt-3 inline-flex items-center rounded-md border px-4 py-2.5 text-sm font-medium transition ${
          hasEvidencePack
            ? 'border-[rgba(24,43,73,0.25)] text-[var(--ucsd-text)] hover:bg-slate-50'
            : 'cursor-not-allowed border-gray-300 text-gray-400'
        }`}
      >
        Download QA evidence pack (JSON)
      </button>
    </section>
  );
}
