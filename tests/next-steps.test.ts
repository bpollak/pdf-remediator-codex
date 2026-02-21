import { describe, expect, it } from 'vitest';
import { buildManualNextSteps } from '@/lib/report/next-steps';
import type { AuditFinding } from '@/lib/audit/types';

function finding(overrides: Partial<AuditFinding> = {}): AuditFinding {
  return {
    ruleId: 'DOC-001',
    category: 'Document Structure',
    severity: 'major',
    description: 'Missing metadata identifier.',
    wcagCriterion: '4.1.2 Name, Role, Value',
    location: { page: 1 },
    recommendation: 'Add PDF/UA metadata identifier.',
    autoFixable: false,
    ...overrides
  };
}

describe('buildManualNextSteps', () => {
  it('adds high-priority step when veraPDF is non-compliant', () => {
    const steps = buildManualNextSteps({
      remediatedFindings: [],
      verapdfResult: {
        attempted: true,
        compliant: false,
        summary: { failedRules: 3, failedChecks: 12 }
      }
    });

    expect(steps[0]?.title).toContain('Open the remediated PDF in Acrobat or PAC');
    expect(steps[0]?.severity).toBe('high');
  });

  it('includes top remaining findings and recommendation text', () => {
    const steps = buildManualNextSteps({
      remediatedFindings: [
        finding({ ruleId: 'DOC-003', severity: 'critical', description: 'Language missing.' }),
        finding({ ruleId: 'DOC-001', severity: 'major' })
      ],
      verapdfResult: { attempted: true, compliant: false }
    });

    expect(steps.some((step) => step.details?.includes('Rule DOC-003'))).toBe(true);
    expect(steps.some((step) => step.description.includes('Do this: Add PDF/UA metadata identifier'))).toBe(true);
  });

  it('returns low-priority no-action step when nothing remains', () => {
    const steps = buildManualNextSteps({
      remediatedFindings: [],
      verapdfResult: { attempted: true, compliant: true }
    });

    expect(steps[0]?.title).toBe('No manual fixes required right now');
    expect(steps[0]?.severity).toBe('low');
  });
});
