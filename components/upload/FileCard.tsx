import Link from 'next/link';
import type { FileEntry } from '@/stores/app-store';

function isWorkingStatus(status: FileEntry['status']): boolean {
  return status !== 'remediated' && status !== 'error';
}

function statusLabel(status: FileEntry['status']): string {
  if (status === 'queued') return 'Queued';
  if (status === 'parsing') return 'Reading your PDF';
  if (status === 'ocr') return 'Making scanned text searchable';
  if (status === 'auditing') return 'Checking accessibility issues';
  if (status === 'audited') return 'Preparing fixes';
  if (status === 'remediating') return 'Applying fixes';
  if (status === 'remediated') return 'Ready: review results';
  return 'Needs attention';
}

function statusHint(status: FileEntry['status']): string | null {
  if (status === 'queued') return 'Waiting to start.';
  if (status === 'parsing') return 'Reading document text and structure.';
  if (status === 'ocr') return 'Trying OCR because this looks like a scanned file.';
  if (status === 'auditing') return 'Checking the original file for accessibility issues.';
  if (status === 'audited') return 'Building a plan for automated fixes.';
  if (status === 'remediating') return 'Creating your updated PDF.';
  if (status === 'remediated') return 'Open results to review, download, and complete manual steps.';
  return 'Something went wrong. Review the error and upload again.';
}

function statusBadge(status: FileEntry['status']) {
  if (status === 'remediated') {
    return <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">{statusLabel(status)}</span>;
  }
  if (status === 'error') {
    return <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">{statusLabel(status)}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-[var(--ucsd-blue)]" role="status" aria-live="polite">
      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" className="opacity-25" stroke="currentColor" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {statusLabel(status)}
    </span>
  );
}

function accentBorder(file: FileEntry) {
  if (file.status === 'remediated') return 'border-l-4 border-l-green-500';
  if (file.status === 'error') return 'border-l-4 border-l-red-500';
  return 'border-l-4 border-l-[var(--ucsd-blue)]';
}

export function FileCard({ file }: { file: FileEntry }) {
  const isProcessed = file.status === 'remediated';
  const isWorking = isWorkingStatus(file.status);

  return (
    <article className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md ${accentBorder(file)}`}>
      <div className="flex items-center justify-between">
        <h3 className="truncate font-medium text-[var(--ucsd-navy)]">{file.name}</h3>
        {statusBadge(file.status)}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-1.5 rounded-full bg-[var(--ucsd-blue)] transition-all duration-300 ${isWorking ? 'animate-pulse' : ''}`}
          style={{ width: `${file.progress}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-[var(--ucsd-blue)]">{statusHint(file.status)}</p>

      {file.error ? <p className="mt-2 text-sm text-red-600">{file.error}</p> : null}
      {isProcessed ? (
        <div className="mt-3">
          <Link
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--ucsd-blue)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--ucsd-navy)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ucsd-gold)] focus-visible:ring-offset-2"
            href={`/app/${file.id}/compare`}
          >
            View results
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638l-3.96-3.96a.75.75 0 1 1 1.06-1.06l5.25 5.25a.75.75 0 0 1 0 1.06l-5.25 5.25a.75.75 0 1 1-1.06-1.06l3.96-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
            </svg>
          </Link>
        </div>
      ) : null}
    </article>
  );
}
