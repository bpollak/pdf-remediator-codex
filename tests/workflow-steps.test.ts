import { describe, expect, it } from 'vitest';
import { buildWorkflowSteps } from '@/lib/report/workflow-steps';
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

describe('buildWorkflowSteps', () => {
  it('keeps the download step current until the user actually downloads the file', () => {
    const steps = buildWorkflowSteps(makeFile());

    expect(steps[0]?.key).toBe('download');
    expect(steps[0]?.state).toBe('current');
    expect(steps[1]?.state).toBe('pending');
  });

  it('moves review to the current step after download is recorded', () => {
    const steps = buildWorkflowSteps(
      makeFile({
        workflowProgress: {
          downloadedAt: '2026-03-10T19:05:00.000Z'
        }
      })
    );

    expect(steps[0]?.state).toBe('complete');
    expect(steps[1]?.state).toBe('current');
  });

  it('marks optional planning steps as not needed when no manual plan is required', () => {
    const steps = buildWorkflowSteps(
      makeFile({
        workflowProgress: {
          downloadedAt: '2026-03-10T19:05:00.000Z',
          reviewedAt: '2026-03-10T19:06:00.000Z'
        }
      })
    );

    expect(steps[2]?.title).toBe('Prepare alt text updates');
    expect(steps[2]?.state).toBe('not-needed');
    expect(steps[3]?.title).toBe('Prepare structure fixes');
    expect(steps[3]?.state).toBe('not-needed');
    expect(steps[4]?.state).toBe('complete');
    expect(steps[5]?.state).toBe('complete');
  });
});
