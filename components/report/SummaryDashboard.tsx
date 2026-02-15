'use client';

import { useAppStore } from '@/stores/app-store';
import { ComplianceScore } from './ComplianceScore';

export function SummaryDashboard({ fileId }: { fileId: string }) {
  const file = useAppStore((s) => s.files.find((f) => f.id === fileId));
  if (!file?.auditResult) return <p>No audit result yet.</p>;

  return (
    <section className="rounded border p-4 dark:border-slate-700">
      <ComplianceScore score={file.auditResult.score} />
      <p className="mt-2 text-sm">Findings: {file.auditResult.findings.length}</p>
    </section>
  );
}
