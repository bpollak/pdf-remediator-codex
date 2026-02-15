'use client';

import { useAppStore } from '@/stores/app-store';
import { IssueCard } from './IssueCard';

type AuditVariant = 'original' | 'remediated';

interface IssueListProps {
  fileId: string;
  variant?: AuditVariant;
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

  return (
    <section className="space-y-3">
      {auditResult.findings.map((finding) => (
        <IssueCard key={`${finding.ruleId}-${finding.description}`} finding={finding} />
      ))}
    </section>
  );
}
