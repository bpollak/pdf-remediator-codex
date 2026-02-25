'use client';

import { SideBySide } from '@/components/preview/SideBySide';
import { CompareActions } from '@/components/report/CompareActions';
import { IssueList } from '@/components/report/IssueList';
import { ManualStructureWorkspace } from '@/components/report/ManualStructureWorkspace';
import { NextStepsPanel } from '@/components/report/NextStepsPanel';
import { PublishingReadinessBanner } from '@/components/report/PublishingReadinessBanner';
import { SummaryDashboard } from '@/components/report/SummaryDashboard';
import { AltTextWorkspace } from '@/components/report/AltTextWorkspace';
import { StructuralIntegrityPanel } from '@/components/report/StructuralIntegrityPanel';
import { VerificationPanel } from '@/components/report/VerificationPanel';
import { useAppStore } from '@/stores/app-store';

export default function ComparePage({ params }: { params: { fileId: string } }) {
  const documentName = useAppStore((s) => s.files.find((entry) => entry.id === params.fileId)?.name);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="break-words">Before and After Accessibility Report</h1>
        <p className="break-words text-sm text-[var(--ucsd-text)]">Document: {documentName ?? 'Uploaded PDF'}</p>
      </div>
      <SideBySide fileId={params.fileId} />
      <StructuralIntegrityPanel fileId={params.fileId} />
      <AltTextWorkspace fileId={params.fileId} />
      <ManualStructureWorkspace fileId={params.fileId} />
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
      <VerificationPanel fileId={params.fileId} />
      <NextStepsPanel fileId={params.fileId} />
      <PublishingReadinessBanner fileId={params.fileId} />
      <CompareActions fileId={params.fileId} />
    </div>
  );
}
