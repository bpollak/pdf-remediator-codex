import Link from 'next/link';
import type { FileEntry } from '@/stores/app-store';

export function FileCard({ file }: { file: FileEntry }) {
  return (
    <article className="rounded border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{file.name}</h3>
        <span className="text-sm capitalize">{file.status}</span>
      </div>
      <div className="mt-2 h-2 rounded bg-slate-200 dark:bg-slate-800">
        <div className="h-2 rounded bg-indigo-600" style={{ width: `${file.progress}%` }} />
      </div>
      <div className="mt-3 space-x-3 text-sm">
        <Link className="text-indigo-600 hover:underline" href={`/app/${file.id}`}>Report</Link>
        <Link className="text-indigo-600 hover:underline" href={`/app/${file.id}/compare`}>Compare</Link>
      </div>
    </article>
  );
}
