'use client';

import { SideBySide } from '@/components/preview/SideBySide';
import { CompareActions, EvidencePackAction } from '@/components/report/CompareActions';
import { IssueList } from '@/components/report/IssueList';
import { ManualStructureWorkspace } from '@/components/report/ManualStructureWorkspace';
import { NextStepsPanel } from '@/components/report/NextStepsPanel';
import { PublishingReadinessBanner } from '@/components/report/PublishingReadinessBanner';
import { ReportStatePanel } from '@/components/report/ReportStatePanel';
import { RevisionDeltaPanel } from '@/components/report/RevisionDeltaPanel';
import { SummaryDashboard } from '@/components/report/SummaryDashboard';
import { AltTextWorkspace } from '@/components/report/AltTextWorkspace';
import { StructuralIntegrityPanel } from '@/components/report/StructuralIntegrityPanel';
import { VerificationPanel } from '@/components/report/VerificationPanel';
import { WorkflowStepper } from '@/components/report/WorkflowStepper';
import { useAppStore } from '@/stores/app-store';

export default function ComparePage({ params }: { params: { fileId: string } }) {
  const hydrated = useAppStore((s) => s.hydrated);
  const documentName = useAppStore((s) => s.files.find((entry) => entry.id === params.fileId)?.name);

  if (!hydrated) {
    return (
      <div className="space-y-3">
        <h1>Accessibility Remediation Workflow</h1>
        <p className="text-sm text-[var(--ucsd-text)]">Loading saved results...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="break-words">Accessibility Remediation Workflow</h1>
        <p className="break-words text-sm text-[var(--ucsd-text)]">Document: {documentName ?? 'Uploaded PDF'}</p>
        <p className="text-sm text-[var(--ucsd-text)]">
          Use this app for first-pass remediation, review, and QA packaging. Finish final tag editing and desktop validation in Acrobat or PAC before publishing.
        </p>
      </div>
      <div id="publish-step" className="scroll-mt-24">
        <PublishingReadinessBanner fileId={params.fileId} />
      </div>
      <ReportStatePanel fileId={params.fileId} />
      <RevisionDeltaPanel fileId={params.fileId} />
      <WorkflowStepper fileId={params.fileId} />

      <div id="download-step" className="scroll-mt-24">
        <CompareActions fileId={params.fileId} />
      </div>

      <div id="review-step" className="scroll-mt-24 space-y-6">
        <section className="space-y-3 rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
          <div>
            <h2>Review previews and findings</h2>
            <p className="mt-1 text-sm text-[var(--ucsd-text)]">
              Confirm the document, review the automated baseline, and use the findings below to decide what still needs manual remediation.
            </p>
          </div>
          <EvidencePackAction fileId={params.fileId} />
          <SideBySide fileId={params.fileId} />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <h2>Uploaded PDF findings</h2>
            <SummaryDashboard fileId={params.fileId} variant="original" />
            <IssueList fileId={params.fileId} variant="original" />
          </div>
          <div className="space-y-4">
            <h2>Remediated PDF findings</h2>
            <SummaryDashboard fileId={params.fileId} variant="remediated" />
            <IssueList fileId={params.fileId} variant="remediated" />
          </div>
        </section>
      </div>

      <div id="alt-text-step" className="scroll-mt-24">
        <AltTextWorkspace fileId={params.fileId} />
      </div>

      <div id="structure-step" className="scroll-mt-24 space-y-6">
        <StructuralIntegrityPanel fileId={params.fileId} />
        <ManualStructureWorkspace fileId={params.fileId} />
      </div>

      <div id="validation-step" className="scroll-mt-24">
        <VerificationPanel fileId={params.fileId} />
      </div>

      <div id="next-steps-step" className="scroll-mt-24">
        <NextStepsPanel fileId={params.fileId} />
      </div>
    </div>
  );
}
