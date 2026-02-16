'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/stores/app-store';

function formatBytes(byteLength: number): string {
  if (byteLength < 1024) return `${byteLength} B`;
  if (byteLength < 1024 * 1024) return `${(byteLength / 1024).toFixed(1)} KB`;
  return `${(byteLength / (1024 * 1024)).toFixed(2)} MB`;
}

function hashToHex(hash: ArrayBuffer): string {
  return Array.from(new Uint8Array(hash))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function PdfPreviewPane({
  title,
  bytes,
  fileName,
  score,
  downloadLabel
}: {
  title: string;
  bytes?: ArrayBuffer;
  fileName: string;
  score?: number;
  downloadLabel: string;
}) {
  const blobUrl = useMemo(() => {
    if (!bytes) return null;
    const blob = new Blob([bytes], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
  }, [bytes]);
  const [sha256, setSha256] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!bytes) {
      setSha256(null);
      return () => {
        cancelled = true;
      };
    }

    if (typeof crypto === 'undefined' || !crypto.subtle) {
      setSha256('unavailable in this browser');
      return () => {
        cancelled = true;
      };
    }

    setSha256(null);
    crypto.subtle
      .digest('SHA-256', bytes.slice(0))
      .then((hash) => {
        if (!cancelled) setSha256(hashToHex(hash));
      })
      .catch(() => {
        if (!cancelled) setSha256('failed to compute');
      });

    return () => {
      cancelled = true;
    };
  }, [bytes]);

  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  if (!bytes) {
    return (
      <div className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 text-sm text-[var(--ucsd-blue)]">
        <p className="font-medium text-[var(--ucsd-navy)]">{title}</p>
        <p className="mt-2">
          This preview is unavailable right now. Upload/process the file in this browser session, then open Compare again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
      <div>
        <p className="font-medium text-[var(--ucsd-navy)]">{title}</p>
        <p className="text-sm text-[var(--ucsd-blue)]">
          {typeof score === 'number' ? `Compliance score: ${score}%` : 'Compliance score: unavailable'}
        </p>
        <p className="text-xs text-[var(--ucsd-blue)]">File size: {formatBytes(bytes.byteLength)}</p>
        <p className="text-xs text-[var(--ucsd-blue)]">
          SHA-256:{' '}
          <span className="break-all font-mono text-[11px]">{sha256 ?? 'calculating...'}</span>
        </p>
      </div>
      <iframe
        src={blobUrl ?? undefined}
        title={title}
        className="h-[70vh] w-full rounded border border-[rgba(24,43,73,0.2)]"
      />
      <a
        href={blobUrl ?? undefined}
        download={fileName}
        target="_blank"
        rel="noreferrer"
        className="inline-block text-sm text-[var(--ucsd-blue)] hover:underline"
      >
        {downloadLabel}
      </a>
    </div>
  );
}

export function SideBySide({ fileId }: { fileId: string }) {
  const file = useAppStore((s) => s.files.find((entry) => entry.id === fileId));
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <section className="grid gap-4 md:grid-cols-2">
      <PdfPreviewPane
        title="Original preview"
        bytes={file?.uploadedBytes}
        fileName={file?.name ?? 'original.pdf'}
        score={file?.auditResult?.score}
        downloadLabel="Open or download original PDF"
      />
      <PdfPreviewPane
        title="Remediated preview"
        bytes={file?.remediatedBytes}
        fileName={file ? `remediated-${file.name}` : 'remediated.pdf'}
        score={file?.postRemediationAudit?.score}
        downloadLabel="Open or download remediated PDF"
      />
    </section>
  );
}
