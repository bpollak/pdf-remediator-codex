import { getAccessibilityStatus } from '@/lib/report/accessibility-status';
import type { FileEntry } from '@/types/file-entry';

/** How a file card is shown: working (blue), done (green), review (amber), error (red). */
export type FileCardTone = 'working' | 'done' | 'review' | 'error';

export function isSettledStatus(status: FileEntry['status']): boolean {
  return status === 'remediated' || status === 'error';
}

/** OCR added text, but not for every page (it reads at most the first few). */
export function hasPartialOcr(file: FileEntry): boolean {
  return Boolean(file.ocrApplied && file.ocrCoverage && file.ocrCoverage.pagesProcessed < file.ocrCoverage.totalPages);
}

/**
 * "done" (green) only when nothing is left for the user; any manual step,
 * analysis-only result or OCR shortfall makes it "review" (amber).
 */
export function getFileCardTone(file: FileEntry): FileCardTone {
  if (file.status === 'error') return 'error';
  if (file.status !== 'remediated') return 'working';
  if (file.ocrAttempted && !file.ocrApplied) return 'review';
  if (hasPartialOcr(file) || file.remediationMode === 'analysis-only') return 'review';
  return getAccessibilityStatus(file).status === 'accessible' ? 'done' : 'review';
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** "10 files: 7 need review, 1 failed, 2 processing." */
export function summarizeBatch(files: FileEntry[]): string {
  const counts: Record<FileCardTone, number> = { done: 0, review: 0, error: 0, working: 0 };
  let waiting = 0;
  for (const file of files) {
    const tone = getFileCardTone(file);
    if (tone === 'working' && file.status === 'queued') waiting += 1;
    else counts[tone] += 1;
  }
  const parts = [
    counts.done ? `${counts.done} done` : '',
    counts.review ? `${counts.review} ${counts.review === 1 ? 'needs' : 'need'} review` : '',
    counts.error ? `${counts.error} failed` : '',
    counts.working ? `${counts.working} processing` : '',
    waiting ? `${waiting} waiting` : ''
  ].filter(Boolean);
  return `${plural(files.length, 'file')}: ${parts.join(', ')}.`;
}

/** What the queue's live region says when a file finishes. */
export function describeFileFinished(file: FileEntry, files: FileEntry[]): string {
  const settled = files.filter((entry) => isSettledStatus(entry.status)).length;
  const progress = `${settled} of ${plural(files.length, 'file')} done.`;
  if (file.status === 'error') return `${file.name} could not be processed. ${progress}`;
  if (getFileCardTone(file) === 'review') return `${file.name} is ready and needs your review. ${progress}`;
  return `${file.name} is ready. ${progress}`;
}

export function describeFileRemoved(file: FileEntry, remainingCount: number): string {
  return `${file.name} removed. ${plural(remainingCount, 'file')} left.`;
}
