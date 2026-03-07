import { describe, expect, it } from 'vitest';
import { getReportStateSnapshot } from '@/lib/report/report-state';
import type { FileEntry } from '@/types/file-entry';

function makeFile(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    id: 'file-1',
    name: 'sample.pdf',
    size: 1024,
    uploadedBytes: new ArrayBuffer(8),
    remediatedBytes: new ArrayBuffer(8),
    status: 'remediated',
    progress: 100,
    postRemediationAudit: {
      score: 100,
      findings: []
    },
    verapdfResult: {
      attempted: true,
      compliant: true,
      summary: {
        passedRules: 32,
        failedRules: 0,
        passedChecks: 400,
        failedChecks: 0
      }
    },
    ...overrides
  };
}

describe('getReportStateSnapshot', () => {
  it('reports an accessible validated file with publish guidance when no drafts are pending', () => {
    const snapshot = getReportStateSnapshot(makeFile());

    expect(snapshot.validatedFile.label).toBe('Accessible');
    expect(snapshot.draftPlan.label).toBe('No saved draft edits yet');
    expect(snapshot.nextAction.label).toBe('Final spot-check and publish');
    expect(snapshot.nextAction.href).toBe('#next-steps-step');
  });

  it('reports pending draft work and a revised-upload next action', () => {
    const snapshot = getReportStateSnapshot(
      makeFile({
        manualReviewDrafts: {
          altText: {
            'img-1': {
              alt: 'Updated alt text',
              decorative: false
            }
          },
          structure: {
            headings: {
              'h-1-1-2': {
                level: 1
              }
            },
            headingOrder: [],
            tableDecisions: {}
          },
          lastUpdatedAt: '2026-03-07T18:00:00.000Z'
        }
      })
    );

    expect(snapshot.draftPlan.label).toBe('Draft changes waiting for re-validation');
    expect(snapshot.nextAction.label).toBe('Upload revised PDF for validation');
    expect(snapshot.nextAction.href).toContain('revalidateFor=file-1');
  });
});
