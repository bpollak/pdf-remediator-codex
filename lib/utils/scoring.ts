import type { AuditFinding, Severity } from '@/lib/audit/types';

/**
 * Per-rule severity weights.
 *
 * The score starts at 100 and loses points for each *distinct rule* that is
 * violated.  Multiple findings from the same rule (e.g. 10 images without alt
 * text) count as a single violation — the score reflects how many accessibility
 * *areas* have problems, not how many individual elements are affected.
 *
 * Weights are tuned so that:
 *  - A single critical issue drops the score noticeably (~15 pts)
 *  - A single major issue is significant but smaller (~8 pts)
 *  - A single minor issue is a small nudge (~3 pts)
 *  - A fully-inaccessible document (many violations) converges toward 0
 */
const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 15,
  major: 8,
  minor: 3,
};

/**
 * Hard ceilings for specific structural issues.
 * These cap the score regardless of how few other issues exist, because
 * these conditions fundamentally prevent assistive technology access.
 */
const SCORE_CAPS: Record<string, number> = {
  'DOC-004': 15,  // scanned / image-only — nearly unusable
  'DOC-002': 40,  // no StructTreeRoot — no semantic structure at all
};

export function computeComplianceScore(_totalRules: number, findings: AuditFinding[]): number {
  if (findings.length === 0) return 100;

  // Group findings by rule ID and take the highest severity per rule
  const worstSeverityByRule = new Map<string, Severity>();
  for (const finding of findings) {
    const current = worstSeverityByRule.get(finding.ruleId);
    if (!current || severityRank(finding.severity) > severityRank(current)) {
      worstSeverityByRule.set(finding.ruleId, finding.severity);
    }
  }

  // Sum penalty across distinct violated rules
  let totalPenalty = 0;
  for (const [, severity] of worstSeverityByRule) {
    totalPenalty += SEVERITY_WEIGHT[severity];
  }

  let score = Math.max(0, Math.round(100 - totalPenalty));

  // Apply hard ceilings for fundamental structural problems
  for (const [ruleId, cap] of Object.entries(SCORE_CAPS)) {
    if (worstSeverityByRule.has(ruleId)) {
      score = Math.min(score, cap);
    }
  }

  return score;
}

function severityRank(severity: Severity): number {
  if (severity === 'critical') return 3;
  if (severity === 'major') return 2;
  return 1;
}
