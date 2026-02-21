'use client';

import { SummaryDashboard } from '@/components/report/SummaryDashboard';
import { IssueList } from '@/components/report/IssueList';

export default function FileReportPage({ params }: { params: { fileId: string } }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--ucsd-navy)]">Accessibility report: {params.fileId}</h1>
      <SummaryDashboard fileId={params.fileId} />
      <IssueList fileId={params.fileId} />
    </div>
  );
}
