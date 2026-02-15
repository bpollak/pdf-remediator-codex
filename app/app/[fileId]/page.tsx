'use client';

import { SummaryDashboard } from '@/components/report/SummaryDashboard';
import { IssueList } from '@/components/report/IssueList';

export default function FileReportPage({ params }: { params: { fileId: string } }) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-[var(--ucsd-navy)]">Audit report: {params.fileId}</h2>
      <SummaryDashboard fileId={params.fileId} />
      <IssueList fileId={params.fileId} />
    </div>
  );
}
