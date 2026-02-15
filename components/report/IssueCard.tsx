import type { AuditFinding } from '@/lib/audit/types';

export function IssueCard({ finding }: { finding: AuditFinding }) {
  return (
    <article className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-3 shadow-sm">
      <p className="font-medium text-[var(--ucsd-navy)]">{finding.ruleId} · {finding.wcagCriterion}</p>
      <p className="text-[var(--ucsd-navy)]">{finding.description}</p>
      <p className="text-sm text-[var(--ucsd-blue)]">Page {finding.location.page ?? '-'} · {finding.severity}</p>
    </article>
  );
}
