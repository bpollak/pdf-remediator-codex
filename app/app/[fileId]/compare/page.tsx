'use client';

import { SideBySide } from '@/components/preview/SideBySide';
import { IssueList } from '@/components/report/IssueList';
import { SummaryDashboard } from '@/components/report/SummaryDashboard';

export default function ComparePage({ params }: { params: { fileId: string } }) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-[var(--ucsd-navy)]">Before/after compare: {params.fileId}</h2>
      <SideBySide fileId={params.fileId} />
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-[var(--ucsd-navy)]">Original document report</h3>
          <SummaryDashboard fileId={params.fileId} variant="original" />
          <IssueList fileId={params.fileId} variant="original" />
        </div>
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-[var(--ucsd-navy)]">Remediated document report</h3>
          <SummaryDashboard fileId={params.fileId} variant="remediated" />
          <IssueList fileId={params.fileId} variant="remediated" />
        </div>
      </section>
    </div>
  );
}
