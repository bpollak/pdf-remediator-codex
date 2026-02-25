import { describe, expect, it } from 'vitest';
import type { AuditResult, AuditFinding } from '@/lib/audit/types';
import { computeDisplayedAutomatedScore } from '@/lib/report/display-score';

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

describe('computeDisplayedAutomatedScore', () => {
  it('keeps 100 for remediated output only when criticals are clear and external verification is compliant', () => {
    const displayed = computeDisplayedAutomatedScore({
      variant: 'remediated',
      auditResult: auditResult(100, []),
      verapdfResult: { attempted: true, compliant: true }
    });

    expect(displayed).toBe(100);
  });

  it('caps remediated perfect score when external verification is not compliant', () => {
    const displayed = computeDisplayedAutomatedScore({
      variant: 'remediated',
      auditResult: auditResult(100, []),
      verapdfResult: { attempted: true, compliant: false }
    });

    expect(displayed).toBe(99);
  });

  it('caps remediated perfect score when critical findings remain', () => {
    const displayed = computeDisplayedAutomatedScore({
      variant: 'remediated',
      auditResult: auditResult(100, [finding({ ruleId: 'DOC-005', severity: 'critical' })]),
      verapdfResult: { attempted: true, compliant: true }
    });

    expect(displayed).toBe(99);
  });

  it('does not alter non-perfect scores', () => {
    const displayed = computeDisplayedAutomatedScore({
      variant: 'remediated',
      auditResult: auditResult(94, []),
      verapdfResult: { attempted: true, compliant: false }
    });

    expect(displayed).toBe(94);
  });

  it('does not cap original-document scores', () => {
    const displayed = computeDisplayedAutomatedScore({
      variant: 'original',
      auditResult: auditResult(100, []),
      verapdfResult: { attempted: true, compliant: false }
    });

    expect(displayed).toBe(100);
  });
});

