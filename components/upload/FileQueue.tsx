'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppStore, type FileEntry } from '@/stores/app-store';
import { STORED_FILE_RETENTION_DAYS } from '@/lib/persistence/file-store';
import { describeFileFinished, describeFileRemoved, isSettledStatus, summarizeBatch } from '@/lib/client/file-status';
import { FileCard, fileCardHeadingId } from './FileCard';

/** The upload input in DropZone; focus goes there when the last card is removed. */
export const UPLOAD_INPUT_ID = 'pdf-upload-input';

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** One polite live region for the whole queue, announcing files as they finish. */
function useQueueAnnouncements(): [string, (message: string) => void] {
  const [message, setMessage] = useState('');

  useEffect(
    () =>
      useAppStore.subscribe((state, previous) => {
        const before = new Map(previous.files.map((file) => [file.id, file.status]));
        const finished = state.files.filter((file) => {
          const previousStatus = before.get(file.id);
          return previousStatus !== undefined && previousStatus !== file.status && isSettledStatus(file.status);
        });
        if (finished.length > 0) {
          setMessage(finished.map((file) => describeFileFinished(file, state.files)).join(' '));
        }
      }),
    []
  );

  return [message, setMessage];
}

function ClearAllFiles({ count }: { count: number }) {
  const clearAllFiles = useAppStore((state) => state.clearAllFiles);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Move keyboard focus into the confirmation when it opens.
  useEffect(() => {
    if (confirming) confirmButtonRef.current?.focus();
  }, [confirming]);

  async function handleConfirm() {
    setError(null);
    try {
      await clearAllFiles();
      setConfirming(false);
      document.getElementById(UPLOAD_INPUT_ID)?.focus();
    } catch {
      setError('Some files could not be deleted from this browser. Try again, or clear this site’s data in your browser settings.');
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm font-medium text-red-700 underline underline-offset-2 hover:text-red-800"
      >
        Clear all my files from this browser
      </button>
    );
  }

  return (
    <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="group" aria-label="Confirm clearing all files">
      <p>
        Delete all {plural(count, 'file')} and their results from this browser? This cannot be undone. Download any
        updated PDFs you want to keep first.
      </p>
      <div className="mt-2 flex flex-wrap gap-3">
        <button
          type="button"
          ref={confirmButtonRef}
          onClick={handleConfirm}
          className="rounded-md bg-red-700 px-3 py-1.5 font-medium text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2"
        >
          Delete all files
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-medium text-[var(--ucsd-text)] hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
      {error ? <p className="mt-2" role="alert">{error}</p> : null}
    </div>
  );
}

export function FileQueue() {
  const files = useAppStore((s) => s.files);
  const hydrated = useAppStore((s) => s.hydrated);
  const expiredFileCount = useAppStore((s) => s.expiredFileCount);
  const removeFile = useAppStore((s) => s.removeFile);
  const [announcement, setAnnouncement] = useQueueAnnouncements();
  const displayFiles = [...files].reverse();

  function handleRemove(file: FileEntry) {
    // Focus the card that takes this one's place, or the upload input.
    const index = displayFiles.findIndex((entry) => entry.id === file.id);
    removeFile(file.id);
    const remaining = useAppStore.getState().files;
    const remainingIds = new Set(remaining.map((entry) => entry.id));
    const candidates = [...displayFiles.slice(index + 1), ...displayFiles.slice(0, index).reverse()];
    const nextFile = candidates.find((entry) => remainingIds.has(entry.id));
    setAnnouncement(describeFileRemoved(file, remaining.length));
    requestAnimationFrame(() => {
      const target = nextFile ? document.getElementById(fileCardHeadingId(nextFile.id)) : document.getElementById(UPLOAD_INPUT_ID);
      target?.focus();
    });
  }

  // Always rendered at the same place so screen readers keep tracking it.
  const liveRegion = (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {announcement}
    </div>
  );

  const expiredNote =
    expiredFileCount > 0 ? (
      <p className="text-sm text-[var(--ucsd-text)]">
        {plural(expiredFileCount, 'file')} older than {STORED_FILE_RETENTION_DAYS} days{' '}
        {expiredFileCount === 1 ? 'was' : 'were'} removed from this browser.
      </p>
    ) : null;

  let content: React.ReactNode;
  if (!hydrated) {
    content = <p className="text-[var(--ucsd-text)]">Loading saved files...</p>;
  } else if (files.length === 0) {
    content = (
      <>
        {expiredNote}
        <p className="text-[var(--ucsd-text)]">No files yet. Upload PDFs to begin.</p>
      </>
    );
  } else {
    content = (
      <section className="space-y-3" aria-labelledby="file-queue-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="file-queue-heading" className="text-2xl md:text-3xl">Your files</h2>
          <ClearAllFiles count={files.length} />
        </div>
        <p className="text-sm text-[var(--ucsd-text)]">
          Your files are stored only in this browser. Download the updated PDF to keep it.
        </p>
        {expiredNote}
        {files.length >= 2 ? <p className="text-sm font-medium text-[var(--ucsd-navy)]">{summarizeBatch(files)}</p> : null}
        {displayFiles.map((file) => (
          <FileCard key={file.id} file={file} onRemove={handleRemove} />
        ))}
      </section>
    );
  }

  return (
    <div className="space-y-2">
      {liveRegion}
      {content}
    </div>
  );
}
