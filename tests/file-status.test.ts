import { describe, expect, it } from 'vitest';
import { describeFileFinished, getFileCardTone, summarizeBatch } from '@/lib/client/file-status';
import type { FileEntry } from '@/types/file-entry';

function file(overrides: Partial<FileEntry>): FileEntry {
  return { id: overrides.name ?? 'f', name: 'f.pdf', size: 1, status: 'queued', progress: 0, ...overrides };
}

const accessible: Partial<FileEntry> = {
  status: 'remediated',
  remediationMode: 'content-bound',
  postRemediationAudit: { score: 100, findings: [] } as unknown as FileEntry['postRemediationAudit'],
  verapdfResult: { attempted: true, compliant: true, summary: { failedRules: 0, failedChecks: 0 } }
};

describe('file card status', () => {
  it('is green only when nothing is left for the user', () => {
    expect(getFileCardTone(file(accessible))).toBe('done');
    expect(getFileCardTone(file({ ...accessible, remediationMode: 'analysis-only' }))).toBe('review');
    expect(getFileCardTone(file({ ...accessible, ocrAttempted: true, ocrApplied: false }))).toBe('review');
    expect(
      getFileCardTone(file({ ...accessible, ocrAttempted: true, ocrApplied: true, ocrCoverage: { pagesProcessed: 8, totalPages: 20 } }))
    ).toBe('review');
    expect(getFileCardTone(file({ ...accessible, verapdfResult: { attempted: false, reason: 'Down' } }))).toBe('review');
    expect(getFileCardTone(file({ status: 'error' }))).toBe('error');
    expect(getFileCardTone(file({ status: 'ocr' }))).toBe('working');
  });

  it('summarizes a batch', () => {
    const files = [
      ...Array.from({ length: 7 }, (_, index) => file({ id: `r${index}`, status: 'remediated' })),
      file({ id: 'e', status: 'error' }),
      file({ id: 'p1', status: 'parsing' }),
      file({ id: 'p2', status: 'remediating' })
    ];
    expect(summarizeBatch(files)).toBe('10 files: 7 need review, 1 failed, 2 processing.');
    expect(summarizeBatch([file(accessible), file({ id: 'q' })])).toBe('2 files: 1 done, 1 waiting.');
  });

  it('announces finished files with progress', () => {
    const files = [file({ id: 'a', name: 'with-image.pdf', ...accessible }), file({ id: 'b', status: 'parsing' }), file({ id: 'c', name: 'fake.pdf', status: 'error' })];
    expect(describeFileFinished(files[0]!, files)).toBe('with-image.pdf is ready. 2 of 3 files done.');
    expect(describeFileFinished(files[2]!, files)).toBe('fake.pdf could not be processed. 2 of 3 files done.');
  });
});
