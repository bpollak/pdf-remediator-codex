import type { AuditFinding } from '@/lib/audit/types';

export function computeComplianceScore(totalRules: number, findings: AuditFinding[]): number {
  const weightedPenalty = findings.reduce((sum, finding) => {
    if (finding.severity === 'critical') return sum + 6;
    if (finding.severity === 'major') return sum + 3;
    return sum + 1;
  }, 0);

  const maxPenalty = totalRules * 6;
  return Math.max(0, Math.round(((maxPenalty - weightedPenalty) / maxPenalty) * 100));
}
