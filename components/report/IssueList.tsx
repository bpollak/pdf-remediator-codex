'use client';

import { useAppStore } from '@/stores/app-store';
import { IssueCard } from './IssueCard';
import type { AuditFinding, Category } from '@/lib/audit/types';

type AuditVariant = 'original' | 'remediated';

interface IssueListProps {
  fileId: string;
  variant?: AuditVariant;
}

/** Rank severity so categories with critical findings sort first. */
function worstSeverityRank(findings: AuditFinding[]): number {
  let worst = 0;
  for (const f of findings) {
    if (f.severity === 'critical') return 3;
    if (f.severity === 'major' && worst < 2) worst = 2;
    if (f.severity === 'minor' && worst < 1) worst = 1;
  }
  return worst;
}

export function IssueList({ fileId, variant = 'original' }: IssueListProps) {
  const auditResult = useAppStore((s) => {
    const file = s.files.find((f) => f.id === fileId);
    return variant === 'remediated' ? file?.postRemediationAudit : file?.auditResult;
  });

  if (!auditResult) {
    return (
      <section className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 text-sm text-[var(--ucsd-blue)] shadow-sm">
        {variant === 'remediated' ? 'No remediated audit result yet.' : 'No audit result yet.'}
      </section>
    );
  }

  if (!auditResult.findings.length) {
    return (
      <section className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 text-sm text-[var(--ucsd-blue)] shadow-sm">
        No issues identified.
      </section>
    );
  }

  // Group findings by category
  const grouped = new Map<Category, AuditFinding[]>();
  for (const finding of auditResult.findings) {
    const bucket = grouped.get(finding.category) ?? [];
    bucket.push(finding);
    grouped.set(finding.category, bucket);
  }

  // Sort categories: worst severity first, then alphabetically
  const sortedCategories = [...grouped.entries()].sort(
    (a, b) => worstSeverityRank(b[1]) - worstSeverityRank(a[1]) || a[0].localeCompare(b[0])
  );

  return (
    <section className="space-y-6">
      {sortedCategories.map(([category, findings]) => (
        <div key={category}>
          <h4 className="mb-2 flex items-baseline gap-2 text-base font-semibold text-[var(--ucsd-navy)]">
            {category}
            <span className="text-xs font-normal text-gray-400">
              {findings.length} {findings.length === 1 ? 'issue' : 'issues'}
            </span>
          </h4>
          <div className="space-y-2">
            {findings.map((finding) => (
              <IssueCard key={`${finding.ruleId}-${finding.description}`} finding={finding} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
