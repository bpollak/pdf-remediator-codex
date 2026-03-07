import { describe, expect, it } from 'vitest';
import { getRevisionDeltaSummary } from '@/lib/report/revision-delta';
import type { AuditFinding } from '@/lib/audit/types';
import type { FileEntry } from '@/types/file-entry';

function finding(overrides: Partial<AuditFinding> = {}): AuditFinding {
  return {
    ruleId: 'IMG-001',
    category: 'Images & Non-Text Content',
    severity: 'critical',
    description: 'Image is missing alt text.',
    wcagCriterion: '1.1.1 Non-text Content',
    location: { page: 1, element: 'img-1' },
    recommendation: 'Provide meaningful alt text.',
    autoFixable: false,
    ...overrides
  };
}

function makeFile(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    id: 'file-1',
    name: 'sample.pdf',
    size: 2048,
    uploadedBytes: new ArrayBuffer(8),
    remediatedBytes: new ArrayBuffer(8),
    status: 'remediated',
    progress: 100,
    postRemediationAudit: {
      score: 92,
      findings: [finding(), finding({ ruleId: 'TBL-002', category: 'Tables', severity: 'major', description: 'Detected table layout without tags.' })]
    },
    verapdfResult: {
      attempted: true,
      compliant: false,
      summary: {
        failedRules: 3,
        failedChecks: 7
      }
    },
    ...overrides
  };
}

describe('getRevisionDeltaSummary', () => {
  it('compares a revised upload against its parent review', () => {
    const parent = makeFile({
      id: 'parent-1',
      name: 'parent.pdf',
      postRemediationAudit: {
        score: 88,
        findings: [finding(), finding({ ruleId: 'TBL-002', category: 'Tables', severity: 'major', description: 'Detected table layout without tags.' }), finding({ ruleId: 'LNK-001', category: 'Links & Navigation', severity: 'major', description: 'Link text is not meaningful out of context.', location: { page: 2, element: 'click here' } })]
      },
      verapdfResult: {
        attempted: true,
        compliant: false,
        summary: {
          failedRules: 5,
          failedChecks: 11
        }
      }
    });
    const child = makeFile({
      id: 'child-1',
      name: 'child.pdf',
      derivedFromFileId: 'parent-1',
      uploadIntent: 'revalidation',
      postRemediationAudit: {
        score: 96,
        findings: [finding({ ruleId: 'TBL-002', category: 'Tables', severity: 'major', description: 'Detected table layout without tags.' })]
      },
      verapdfResult: {
        attempted: true,
        compliant: false,
        summary: {
          failedRules: 2,
          failedChecks: 5
        }
      }
    });

    const summary = getRevisionDeltaSummary(child, [parent, child]);

    expect(summary?.parent?.id).toBe('parent-1');
    expect(summary?.issuesCleared).toBe(2);
    expect(summary?.issuesIntroduced).toBe(0);
    expect(summary?.metrics.find((metric) => metric.label === 'Automated baseline')?.trend).toBe('improved');
    expect(summary?.metrics.find((metric) => metric.label === 'Failed PDF/UA rules')?.trend).toBe('improved');
  });

  it('surfaces descendant revisions on the original review', () => {
    const parent = makeFile({ id: 'parent-1', name: 'parent.pdf' });
    const child = makeFile({
      id: 'child-1',
      name: 'child.pdf',
      derivedFromFileId: 'parent-1',
      uploadIntent: 'revalidation',
      validationCompletedAt: '2026-03-07T20:00:00.000Z'
    });

    const summary = getRevisionDeltaSummary(parent, [parent, child]);

    expect(summary?.parent).toBeUndefined();
    expect(summary?.descendants).toHaveLength(1);
    expect(summary?.latestDescendant?.id).toBe('child-1');
  });
});
