'use client';

import { useAppStore } from '@/stores/app-store';
import { ComplianceScore } from './ComplianceScore';

type AuditVariant = 'original' | 'remediated';

interface SummaryDashboardProps {
  fileId: string;
  variant?: AuditVariant;
}

export function SummaryDashboard({ fileId, variant = 'original' }: SummaryDashboardProps) {
  const file = useAppStore((s) => s.files.find((f) => f.id === fileId));
  const auditResult = variant === 'remediated' ? file?.postRemediationAudit : file?.auditResult;

  if (!auditResult) {
    return (
      <section className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
        <p className="text-sm text-[var(--ucsd-blue)]">
          {variant === 'remediated' ? 'No remediated audit result yet.' : 'No audit result yet.'}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
      <ComplianceScore score={auditResult.score} />
      <p className="mt-2 text-sm text-[var(--ucsd-blue)]">Findings: {auditResult.findings.length}</p>
    </section>
  );
}
