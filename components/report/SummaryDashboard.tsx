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
      <section className="rounded border p-4 dark:border-slate-700">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {variant === 'remediated' ? 'No remediated audit result yet.' : 'No audit result yet.'}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded border p-4 dark:border-slate-700">
      <ComplianceScore score={auditResult.score} />
      <p className="mt-2 text-sm">Findings: {auditResult.findings.length}</p>
    </section>
  );
}
