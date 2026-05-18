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
    expect(snapshot.nextAction.label).toBe('Download the remediated PDF');
    expect(snapshot.nextAction.href).toBe('#download-step');
  });

  it('moves to review only after the remediated PDF has actually been downloaded', () => {
    const snapshot = getReportStateSnapshot(
      makeFile({
        workflowProgress: {
          downloadedAt: '2026-03-10T19:05:00.000Z'
        }
      })
    );

    expect(snapshot.nextAction.label).toBe('Review the preview and findings');
    expect(snapshot.nextAction.href).toBe('#review-step');
  });

  it('reports pending draft work and a revised-upload next action', () => {
    const snapshot = getReportStateSnapshot(
      makeFile({
        workflowProgress: {
          downloadedAt: '2026-03-10T19:05:00.000Z',
          reviewedAt: '2026-03-10T19:06:00.000Z'
        },
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
          customElements: [],
          lastUpdatedAt: '2026-03-07T18:00:00.000Z'
        }
      })
    );

    expect(snapshot.draftPlan.label).toBe('Draft changes waiting for re-validation');
    expect(snapshot.nextAction.label).toBe('Upload revised PDF for validation');
    expect(snapshot.nextAction.href).toContain('revalidateFor=file-1');
  });

  it('does not report zero failed veraPDF counts when no verdict was returned', () => {
    const snapshot = getReportStateSnapshot(
      makeFile({
        workflowProgress: {
          downloadedAt: '2026-03-10T19:05:00.000Z',
          reviewedAt: '2026-03-10T19:06:00.000Z'
        },
        verapdfResult: {
          attempted: true,
          reason: 'veraPDF request timed out'
        }
      })
    );

    expect(snapshot.validatedFile.label).toBe('Verification unavailable');
    expect(snapshot.validatedFile.description).toContain('veraPDF request timed out.');
    expect(snapshot.validatedFile.chips).toContain('PDF/UA verdict unavailable');
    expect(snapshot.validatedFile.chips).toContain('PDF/UA check details unavailable');
    expect(snapshot.validatedFile.chips).not.toContain('No failed PDF/UA rules');
    expect(snapshot.validatedFile.chips).not.toContain('No failed PDF/UA checks');
  });
});
