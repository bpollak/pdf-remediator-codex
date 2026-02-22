'use client';

import { SideBySide } from '@/components/preview/SideBySide';
import { CompareActions } from '@/components/report/CompareActions';
import { IssueList } from '@/components/report/IssueList';
import { NextStepsPanel } from '@/components/report/NextStepsPanel';
import { PublishingReadinessBanner } from '@/components/report/PublishingReadinessBanner';
import { SummaryDashboard } from '@/components/report/SummaryDashboard';
import { VerificationPanel } from '@/components/report/VerificationPanel';

export default function ComparePage({ params }: { params: { fileId: string } }) {
  return (
    <div className="space-y-6">
      <h1 className="break-words text-2xl">Before and after results: {params.fileId}</h1>
      <PublishingReadinessBanner fileId={params.fileId} />
      <CompareActions fileId={params.fileId} />
      <SideBySide fileId={params.fileId} />
      <VerificationPanel fileId={params.fileId} />
      <NextStepsPanel fileId={params.fileId} />
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <h3>Original document report</h3>
          <SummaryDashboard fileId={params.fileId} variant="original" />
          <IssueList fileId={params.fileId} variant="original" />
        </div>
        <div className="space-y-4">
          <h3>Remediated document report</h3>
          <SummaryDashboard fileId={params.fileId} variant="remediated" />
          <IssueList fileId={params.fileId} variant="remediated" />
        </div>
      </section>
    </div>
  );
}
