'use client';

import { useAppStore } from '@/stores/app-store';
import { IssueCard } from './IssueCard';

export function IssueList({ fileId }: { fileId: string }) {
  const findings = useAppStore((s) => s.files.find((f) => f.id === fileId)?.auditResult?.findings ?? []);

  return (
    <section className="space-y-3">
      {findings.map((finding) => (
        <IssueCard key={`${finding.ruleId}-${finding.description}`} finding={finding} />
      ))}
    </section>
  );
}
