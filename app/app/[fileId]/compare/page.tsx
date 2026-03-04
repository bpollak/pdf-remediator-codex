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
      <CompareActions fileId={params.fileId} />
      <PublishingReadinessBanner fileId={params.fileId} />
      <details className="group rounded border border-[rgba(24,43,73,0.2)] bg-white shadow-sm">
        <summary className="cursor-pointer list-none px-4 py-3 md:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-base font-semibold text-[var(--ucsd-navy)]">
              Detailed report and remediation workspaces (optional)
            </span>
            <span className="text-xs font-medium text-[var(--ucsd-blue)] group-open:hidden">Show details</span>
            <span className="hidden text-xs font-medium text-[var(--ucsd-blue)] group-open:inline">Hide details</span>
          </div>
          <p className="mt-1 pr-4 text-sm text-[var(--ucsd-text)]">
            Open this section when you need diagnostics, manual checklists, or QA evidence context.
          </p>
        </summary>
        <div className="space-y-6 border-t border-[rgba(24,43,73,0.15)] p-4 md:p-5">
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
