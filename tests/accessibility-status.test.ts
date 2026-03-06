import { describe, expect, it } from 'vitest';
import type { AuditFinding, AuditResult } from '@/lib/audit/types';
import { getAccessibilityStatus } from '@/lib/report/accessibility-status';
import type { FileEntry } from '@/types/file-entry';

function finding(overrides: Partial<AuditFinding> = {}): AuditFinding {
  return {
    ruleId: 'DOC-001',
    category: 'Document Structure',
    severity: 'major',
    description: 'Missing metadata identifier.',
    wcagCriterion: '4.1.2 Name, Role, Value',
    location: {},
    recommendation: 'Add metadata identifier.',
    autoFixable: false,
    ...overrides
  };
}

function auditResult(score: number, findings: AuditFinding[] = []): AuditResult {
  return { score, findings };
}

function file(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    id: 'file-1',
    name: 'sample.pdf',
    size: 1024,
    uploadedBytes: new ArrayBuffer(8),
    remediatedBytes: new ArrayBuffer(8),
    status: 'remediated',
    progress: 100,
    postRemediationAudit: auditResult(100, []),
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

describe('getAccessibilityStatus', () => {
  it('returns Accessible only when all publish checks pass', () => {
    const result = getAccessibilityStatus(file());

    expect(result.status).toBe('accessible');
    expect(result.label).toBe('Accessible');
    expect(result.reasons).toEqual([]);
    expect(result.automatedScore).toBe(100);
  });

  it('returns Not yet accessible when the automated baseline is below 100', () => {
    const result = getAccessibilityStatus(
      file({
        postRemediationAudit: auditResult(99, [])
      })
    );

    expect(result.status).toBe('not-yet-accessible');
    expect(result.reasons).toEqual([{ code: 'score-below-100', label: 'Automated baseline is below 100%' }]);
  });

  it('returns Not yet accessible when internal findings remain', () => {
    const result = getAccessibilityStatus(
      file({
        postRemediationAudit: auditResult(92, [finding({ severity: 'critical', ruleId: 'DOC-005' })]),
        verapdfResult: {
          attempted: true,
          compliant: false,
          summary: {
            failedRules: 2,
            failedChecks: 5
          }
        }
      })
    );

    expect(result.status).toBe('not-yet-accessible');
    expect(result.reasons).toContainEqual({ code: 'internal-findings', label: '1 internal issue remains' });
    expect(result.reasons).toContainEqual({ code: 'failed-rules', label: '2 PDF/UA rules failed' });
    expect(result.reasons).toContainEqual({ code: 'failed-checks', label: '5 PDF/UA checks failed' });
  });

  it('treats unavailable verification as a blocking status', () => {
    const result = getAccessibilityStatus(
      file({
        verapdfResult: {
          attempted: false
        }
      })
    );

    expect(result.status).toBe('verification-unavailable');
    expect(result.reasons).toContainEqual({
      code: 'verification-unavailable',
      label: 'External PDF/UA verification unavailable'
    });
  });

  it('blocks Accessible for analysis-only remediation even with a perfect score', () => {
    const result = getAccessibilityStatus(
      file({
        remediationMode: 'analysis-only'
      })
    );

    expect(result.status).toBe('not-yet-accessible');
    expect(result.reasons).toContainEqual({
      code: 'analysis-only',
      label: 'Manual structure tagging is still required'
    });
  });

  it('returns Processing while remediation is still running', () => {
    const result = getAccessibilityStatus(
      file({
        status: 'remediating',
        remediatedBytes: undefined,
        postRemediationAudit: undefined,
        verapdfResult: undefined
      })
    );

    expect(result.status).toBe('processing');
    expect(result.reasons).toEqual([{ code: 'processing', label: 'Updated PDF not ready yet' }]);
  });
});
