'use client';

import { useAppStore } from '@/stores/app-store';
import { FileCard } from './FileCard';

export function FileQueue() {
  const files = useAppStore((s) => s.files);

  if (files.length === 0) return <p className="text-slate-600">No files yet. Upload PDFs to begin.</p>;

  return (
    <div className="space-y-3">
      {files.map((file) => (
        <FileCard key={file.id} file={file} />
      ))}
    </div>
  );
}
