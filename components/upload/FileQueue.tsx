'use client';

import { useAppStore } from '@/stores/app-store';
import { FileCard } from './FileCard';

export function FileQueue() {
  const files = useAppStore((s) => s.files);
  const hydrated = useAppStore((s) => s.hydrated);
  const displayFiles = [...files].reverse();

  if (!hydrated) {
    return <p className="text-[var(--ucsd-text)]">Loading saved files...</p>;
  }

  if (files.length === 0) return <p className="text-[var(--ucsd-text)]">No files yet. Upload PDFs to begin.</p>;

  return (
    <div className="space-y-3">
      {displayFiles.map((file) => (
        <FileCard key={file.id} file={file} />
      ))}
    </div>
  );
}
