import { describe, expect, it } from 'vitest';
import { computeComplianceScore } from '@/lib/utils/scoring';
import type { AuditFinding, Severity } from '@/lib/audit/types';

function makeFinding(ruleId: string, severity: Severity): AuditFinding {
  return {
    ruleId,
    category: 'Images & Non-Text Content',
    severity,
    description: `Test finding for ${ruleId}`,
    wcagCriterion: '1.1.1',
    location: {},
    recommendation: 'Fix it',
    autoFixable: false
  };
}

describe('computeComplianceScore', () => {
  it('returns 100 for no findings', () => {
    expect(computeComplianceScore([])).toBe(100);
  });

  it('deducts 15 points for a single critical finding', () => {
    const findings = [makeFinding('IMG-001', 'critical')];
    expect(computeComplianceScore(findings)).toBe(85);
  });

  it('deducts 8 points for a single major finding', () => {
    const findings = [makeFinding('HEAD-001', 'major')];
    expect(computeComplianceScore(findings)).toBe(92);
  });

  it('deducts 3 points for a single minor finding', () => {
    const findings = [makeFinding('META-001', 'minor')];
    expect(computeComplianceScore(findings)).toBe(97);
  });

  it('groups multiple findings from the same rule and uses worst severity', () => {
    const findings = [
      makeFinding('IMG-001', 'minor'),
      makeFinding('IMG-001', 'critical'),
      makeFinding('IMG-001', 'major')
    ];
    // Same rule ID: only counted once at critical severity (-15)
    expect(computeComplianceScore(findings)).toBe(85);
  });

  it('sums penalties across distinct rules', () => {
    const findings = [
      makeFinding('IMG-001', 'critical'),
      makeFinding('HEAD-001', 'major')
    ];
    // -15 for critical + -8 for major = 77
    expect(computeComplianceScore(findings)).toBe(77);
  });

  it('caps score for DOC-004 (scanned/image-only)', () => {
    const findings = [makeFinding('DOC-004', 'critical')];
    // Normal deduction: 100-15=85, but DOC-004 cap is 15
    expect(computeComplianceScore(findings)).toBe(15);
  });

  it('caps score for DOC-002 (no StructTreeRoot)', () => {
    const findings = [makeFinding('DOC-002', 'minor')];
    // Normal deduction: 100-3=97, but DOC-002 cap is 40
    expect(computeComplianceScore(findings)).toBe(40);
  });

  it('caps score for DOC-005 (unbound structure tree)', () => {
    const findings = [makeFinding('DOC-005', 'minor')];
    expect(computeComplianceScore(findings)).toBe(35);
  });

  it('never returns below 0', () => {
    const findings: AuditFinding[] = [];
    for (let i = 0; i < 20; i++) {
      findings.push(makeFinding(`RULE-${i}`, 'critical'));
    }
    expect(computeComplianceScore(findings)).toBe(0);
  });
});
