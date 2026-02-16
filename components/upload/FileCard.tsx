import Link from 'next/link';
import type { FileEntry } from '@/stores/app-store';

export function FileCard({ file }: { file: FileEntry }) {
  const isProcessed = file.status === 'remediated';

  return (
    <article className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-[var(--ucsd-navy)]">{file.name}</h3>
        <span className="text-sm capitalize text-[var(--ucsd-blue)]">{file.status}</span>
      </div>
      <div className="mt-2 h-2 rounded bg-[rgba(24,43,73,0.15)]">
        <div className="h-2 rounded bg-[var(--ucsd-blue)]" style={{ width: `${file.progress}%` }} />
      </div>

      {file.error ? <p className="mt-2 text-sm text-[var(--ucsd-gold)]">{file.error}</p> : null}
      {file.ocrApplied ? (
        <p className="mt-2 text-sm text-[var(--ucsd-blue)]">
          OCR text layer applied for scanned content{file.ocrReason ? ` (${file.ocrReason})` : ''}.
        </p>
      ) : null}
      {file.ocrAttempted && !file.ocrApplied && file.ocrReason ? (
        <p className="mt-2 text-sm text-[var(--ucsd-blue)]">OCR skipped: {file.ocrReason}.</p>
      ) : null}
      {isProcessed ? (
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link
            className="inline-flex items-center rounded-full bg-[var(--ucsd-gold)] px-3 py-1.5 font-medium text-[var(--ucsd-navy)] transition hover:bg-[var(--ucsd-yellow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ucsd-blue)] focus-visible:ring-offset-2"
            href={`/app/${file.id}/compare`}
          >
            Compare files
          </Link>
        </div>
      ) : null}
    </article>
  );
}
