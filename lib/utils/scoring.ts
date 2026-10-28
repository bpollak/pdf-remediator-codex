import type { AuditFinding, Severity } from '@/lib/audit/types';

/**
 * Per-rule severity weights.
 *
 * The score starts at 100 and loses points for each *distinct rule* that is
 * violated, weighted by the rule's worst severity. Repeated findings of the
 * same rule (e.g. 50 images without alt text) cost more than one: each extra
 * finding adds REPEAT_PENALTY_STEP of the weight, up to MAX_REPEAT_MULTIPLIER
 * times the weight, so one broken area cannot sink the score on its own.
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

/** Share of the rule weight added by each finding after the first. */
const REPEAT_PENALTY_STEP = 0.25;
/** Most a single rule can cost, as a multiple of its weight (reached at 9 findings). */
const MAX_REPEAT_MULTIPLIER = 3;

/**
 * Ceiling for output the remediator could only analyse: its structure is not
 * bound to the visible content, so it is no more usable than an untagged
 * file (same ceiling as DOC-002).
 */
export const ANALYSIS_ONLY_SCORE_CAP = 40;

/**
 * Hard ceilings for specific structural issues.
 * These cap the score regardless of how few other issues exist, because
 * these conditions fundamentally prevent assistive technology access.
 */
const SCORE_CAPS: Record<string, number> = {
  'DOC-004': 15,  // scanned / image-only — nearly unusable
  'DOC-002': 40,  // no StructTreeRoot — no semantic structure at all
  'DOC-005': 35,  // unbound structure tree — tags are not connected to content
};

/** Ceilings that only apply when the rule fires at critical severity. */
const CRITICAL_SCORE_CAPS: Record<string, number> = {
  'DOC-007': 40,  // most page text is outside the tag tree
};

export function computeComplianceScore(findings: AuditFinding[]): number {
  if (findings.length === 0) return 100;

  // Group findings by rule ID and take the highest severity per rule
  const worstSeverityByRule = new Map<string, Severity>();
  const findingCountByRule = new Map<string, number>();
  for (const finding of findings) {
    findingCountByRule.set(finding.ruleId, (findingCountByRule.get(finding.ruleId) ?? 0) + 1);
    const current = worstSeverityByRule.get(finding.ruleId);
    if (!current || severityRank(finding.severity) > severityRank(current)) {
      worstSeverityByRule.set(finding.ruleId, finding.severity);
    }
  }

  // Sum penalty across distinct violated rules, scaled by how often each fired
  let totalPenalty = 0;
  for (const [ruleId, severity] of worstSeverityByRule) {
    const count = findingCountByRule.get(ruleId) ?? 1;
    const multiplier = Math.min(MAX_REPEAT_MULTIPLIER, 1 + REPEAT_PENALTY_STEP * (count - 1));
    totalPenalty += SEVERITY_WEIGHT[severity] * multiplier;
  }

  let score = Math.max(0, Math.round(100 - totalPenalty));

  // Apply hard ceilings for fundamental structural problems
  for (const [ruleId, cap] of Object.entries(SCORE_CAPS)) {
    if (worstSeverityByRule.has(ruleId)) {
      score = Math.min(score, cap);
    }
  }
  for (const [ruleId, cap] of Object.entries(CRITICAL_SCORE_CAPS)) {
    if (worstSeverityByRule.get(ruleId) === 'critical') {
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
