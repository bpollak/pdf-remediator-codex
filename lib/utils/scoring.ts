import type { AuditFinding } from '@/lib/audit/types';

export function computeComplianceScore(totalRules: number, findings: AuditFinding[]): number {
  const weightedPenalty = findings.reduce((sum, finding) => {
    if (finding.severity === 'critical') return sum + 6;
    if (finding.severity === 'major') return sum + 3;
    return sum + 1;
  }, 0);

  const maxPenalty = totalRules * 6;
  const ruleIds = new Set(findings.map((finding) => finding.ruleId));
  let score = Math.max(0, Math.round(((maxPenalty - weightedPenalty) / maxPenalty) * 100));

  if (ruleIds.has('DOC-002')) {
    score = Math.min(score, 45);
  }

  if (ruleIds.has('DOC-004')) {
    score = Math.min(score, 20);
  }

  return score;
}
