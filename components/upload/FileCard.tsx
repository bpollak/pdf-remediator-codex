import Link from 'next/link';
import type { FileEntry } from '@/stores/app-store';

export function FileCard({ file }: { file: FileEntry }) {
  const isProcessed = file.status === 'remediated';

  return (
    <article className="rounded border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{file.name}</h3>
        <span className="text-sm capitalize">{file.status}</span>
      </div>
      <div className="mt-2 h-2 rounded bg-slate-200 dark:bg-slate-800">
        <div className="h-2 rounded bg-indigo-600" style={{ width: `${file.progress}%` }} />
      </div>

      {file.error ? <p className="mt-2 text-sm text-red-600">{file.error}</p> : null}
      {isProcessed ? (
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link
            className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1.5 font-medium text-indigo-700 transition hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:bg-indigo-500/20 dark:text-indigo-200 dark:hover:bg-indigo-500/30"
            href={`/app/${file.id}`}
          >
            View report
          </Link>
          <Link
            className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            href={`/app/${file.id}/compare`}
          >
            Compare files
          </Link>
        </div>
      ) : null}
    </article>
  );
}
