'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAppStore, type FileEntry } from '@/stores/app-store';

const UPLOAD_PAGE_PATH = '/app';

function isInProgress(status: FileEntry['status']): boolean {
  return status !== 'remediated' && status !== 'error';
}

/**
 * Files are processed inside this browser tab, so closing or refreshing it
 * stops unfinished files. The instance in the root layout (`appWide`) warns
 * before unload on every route, including Home and About, and shows the note; the
 * upload page renders its own instance where the note sits above the list.
 */
export function ProcessingNotice({ appWide = false }: { appWide?: boolean }) {
  const pathname = usePathname();
  const hasActiveFiles = useAppStore((state) => state.files.some((file) => isInProgress(file.status)));
  // Another tab is doing the work; closing this one doesn't interrupt it.
  const processingInOtherTab = useAppStore((state) => state.processingInOtherTab);
  const warn = hasActiveFiles && !processingInOtherTab;

  useEffect(() => {
    if (!appWide || !warn) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [appWide, warn]);

  if (!warn) return null;
  if (appWide && pathname === UPLOAD_PAGE_PATH) return null;

  return (
    <div className="rounded border border-[rgba(0,98,155,0.25)] bg-[rgba(0,98,155,0.06)] p-3 text-sm text-[var(--ucsd-text)]">
      Files are processed in this browser tab. Keep it open until every file is done — closing or refreshing stops
      unfinished files, and you would need to start them again.
    </div>
  );
}
