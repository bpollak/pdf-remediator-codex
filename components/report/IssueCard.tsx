import type { AuditFinding } from '@/lib/audit/types';

export function IssueCard({ finding }: { finding: AuditFinding }) {
  return (
    <article className="rounded border p-3 dark:border-slate-700">
      <p className="font-medium">{finding.ruleId} · {finding.wcagCriterion}</p>
      <p>{finding.description}</p>
      <p className="text-sm text-slate-600">Page {finding.location.page ?? '-'} · {finding.severity}</p>
    </article>
  );
}
