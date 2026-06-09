'use client';

import { useEffect } from 'react';
import { useAppStore, type FileEntry } from '@/stores/app-store';

function isInProgress(status: FileEntry['status']): boolean {
  return status !== 'remediated' && status !== 'error';
}

/**
 * Files are processed inside this browser tab; in-progress work is not
 * persisted, so closing or refreshing restarts it. Warn before unload and
 * show a visible note while any file is still being processed.
 */
export function ProcessingNotice() {
  const hasActiveFiles = useAppStore((state) => state.files.some((file) => isInProgress(file.status)));

  useEffect(() => {
    if (!hasActiveFiles) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasActiveFiles]);

  if (!hasActiveFiles) return null;

  return (
    <div className="rounded border border-[rgba(0,98,155,0.25)] bg-[rgba(0,98,155,0.06)] p-3 text-sm text-[var(--ucsd-text)]" role="status" aria-live="polite">
      Files are processed in this browser tab. Keep it open until every file shows &ldquo;Ready&rdquo; — closing or
      refreshing restarts unfinished files.
    </div>
  );
}
