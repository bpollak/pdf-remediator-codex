import type { AuditResult } from '@/lib/audit/types';
import type { VerapdfResult } from '@/lib/verapdf/types';
import { getVerapdfComplianceVerdict } from '@/lib/verapdf/result';
import type { RemediationMode } from '@/lib/pdf/types';
import { ANALYSIS_ONLY_SCORE_CAP } from '@/lib/utils/scoring';

type AuditVariant = 'original' | 'remediated';

function hasCriticalFindings(result: AuditResult): boolean {
  return result.findings.some((finding) => finding.severity === 'critical');
}

export function computeDisplayedAutomatedScore(input: {
  auditResult?: AuditResult;
  variant: AuditVariant;
  verapdfResult?: VerapdfResult;
  /** Mode of the remediated file; analysis-only output is capped. */
  remediationMode?: RemediationMode;
}): number | undefined {
  const { auditResult, variant, verapdfResult, remediationMode } = input;
  if (!auditResult) return undefined;

  // Also covers audit results stored before the audit itself applied the cap.
  if (variant === 'remediated' && remediationMode === 'analysis-only') {
    return Math.min(auditResult.score, ANALYSIS_ONLY_SCORE_CAP);
  }

  // Remediated output cannot present as perfect unless both internal criticals
  // are clear and independent external verification reports compliance.
  if (variant === 'remediated' && auditResult.score >= 100) {
    const canShowPerfect = !hasCriticalFindings(auditResult) && getVerapdfComplianceVerdict(verapdfResult) === true;
    if (!canShowPerfect) return 99;
  }

  return auditResult.score;
}
