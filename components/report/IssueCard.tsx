import type { AuditFinding } from '@/lib/audit/types';

const severityStyles = {
  critical: 'bg-red-100 text-red-800',
  major: 'bg-orange-100 text-orange-800',
  minor: 'bg-gray-100 text-gray-600',
} as const;

export function IssueCard({ finding }: { finding: AuditFinding }) {
  return (
    <article className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-3 shadow-sm">
      <p className="font-medium text-[var(--ucsd-navy)]">
        {finding.ruleId} · {finding.wcagCriterion}
      </p>
      <p className="mt-1 text-[var(--ucsd-navy)]">{finding.description}</p>
      {finding.recommendation && (
        <p className="mt-1 text-sm text-gray-600">
          <span className="font-medium">Recommendation:</span> {finding.recommendation}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[var(--ucsd-blue)]">Page {finding.location.page ?? '-'}</span>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${severityStyles[finding.severity]}`}>
          {finding.severity}
        </span>
        {finding.autoFixable && (
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
            Auto-fixable
          </span>
        )}
      </div>
    </article>
  );
}
