import type { AuditResult } from '@/lib/audit/types';
import type { VerapdfResult } from '@/lib/verapdf/types';

type AuditVariant = 'original' | 'remediated';

function hasCriticalFindings(result: AuditResult): boolean {
  return result.findings.some((finding) => finding.severity === 'critical');
}

export function computeDisplayedAutomatedScore(input: {
  auditResult?: AuditResult;
  variant: AuditVariant;
  verapdfResult?: VerapdfResult;
}): number | undefined {
  const { auditResult, variant, verapdfResult } = input;
  if (!auditResult) return undefined;

  // Remediated output cannot present as perfect unless both internal criticals
  // are clear and independent external verification reports compliance.
  if (variant === 'remediated' && auditResult.score >= 100) {
    const canShowPerfect = !hasCriticalFindings(auditResult) && verapdfResult?.compliant === true;
    if (!canShowPerfect) return 99;
  }

  return auditResult.score;
}

