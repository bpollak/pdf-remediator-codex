'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/stores/app-store';

function PdfPreviewPane({
  title,
  bytes,
  fileName,
  score
}: {
  title: string;
  bytes?: ArrayBuffer;
  fileName: string;
  score?: number;
}) {
  const blobUrl = useMemo(() => {
    if (!bytes) return null;
    const blob = new Blob([bytes], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
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
      <div className="rounded border border-slate-200 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
        <p className="font-medium">{title}</p>
        <p className="mt-2">
          This preview is unavailable right now. Upload/process the file in this browser session, then open Compare again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded border border-slate-200 p-4 dark:border-slate-700">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {typeof score === 'number' ? `Compliance score: ${score}%` : 'Compliance score: unavailable'}
        </p>
      </div>
      <iframe
        src={blobUrl ?? undefined}
        title={title}
        className="h-[70vh] w-full rounded border border-slate-200 dark:border-slate-700"
      />
      <a
        href={blobUrl ?? undefined}
        download={fileName}
        target="_blank"
        rel="noreferrer"
        className="inline-block text-sm text-indigo-600 hover:underline"
      >
        Open or download PDF
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
        bytes={file?.originalBytes}
        fileName={file?.name ?? 'original.pdf'}
        score={file?.auditResult?.score}
      />
      <PdfPreviewPane
        title="Remediated preview"
        bytes={file?.remediatedBytes}
        fileName={file ? `remediated-${file.name}` : 'remediated.pdf'}
        score={file?.postRemediationAudit?.score}
      />
    </section>
  );
}
