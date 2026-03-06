'use client';

import { SideBySide } from '@/components/preview/SideBySide';
import { CompareActions, EvidencePackAction } from '@/components/report/CompareActions';
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
  const hydrated = useAppStore((s) => s.hydrated);
  const documentName = useAppStore((s) => s.files.find((entry) => entry.id === params.fileId)?.name);

  if (!hydrated) {
    return (
      <div className="space-y-3">
        <h1>Before and After Accessibility Report</h1>
        <p className="text-sm text-[var(--ucsd-text)]">Loading saved results...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="break-words">Before and After Accessibility Report</h1>
        <p className="break-words text-sm text-[var(--ucsd-text)]">Document: {documentName ?? 'Uploaded PDF'}</p>
      </div>
      <CompareActions fileId={params.fileId} />
      <PublishingReadinessBanner fileId={params.fileId} />
      <details className="group rounded border-2 border-[var(--ucsd-blue)] bg-[rgba(0,98,155,0.06)] shadow-sm">
        <summary className="cursor-pointer list-none px-4 py-4 md:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xl font-semibold leading-tight text-[var(--ucsd-navy)]">
              Detailed report and remediation workspaces
            </span>
            <span className="inline-flex items-center rounded-md bg-[var(--ucsd-blue)] px-4 py-2 text-sm font-semibold text-white group-open:hidden">
              Show full report details
            </span>
            <span className="hidden items-center rounded-md border border-[rgba(24,43,73,0.35)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ucsd-navy)] group-open:inline-flex">
              Hide full report details
            </span>
          </div>
          <p className="mt-2 pr-4 text-sm font-medium text-[var(--ucsd-text)]">
            Review diagnostics, manual checklists, side-by-side previews, and QA evidence context in this section.
          </p>
        </summary>
        <div className="space-y-6 border-t border-[rgba(24,43,73,0.15)] p-4 md:p-5">
          <EvidencePackAction fileId={params.fileId} />
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
        </div>
      </details>
    </div>
  );
}
