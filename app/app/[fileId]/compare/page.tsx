'use client';

import { useEffect } from 'react';
import { SideBySide } from '@/components/preview/SideBySide';
import { CompareActions, EvidencePackAction } from '@/components/report/CompareActions';
import { CollapsibleSection } from '@/components/report/CollapsibleSection';
import { IssueList } from '@/components/report/IssueList';
import { ManualStructureWorkspace } from '@/components/report/ManualStructureWorkspace';
import { NextStepsPanel } from '@/components/report/NextStepsPanel';
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
  const markWorkflowProgress = useAppStore((s) => s.markWorkflowProgress);
  const reviewedAt = useAppStore((s) => s.files.find((entry) => entry.id === params.fileId)?.workflowProgress?.reviewedAt);
  const documentName = useAppStore((s) => s.files.find((entry) => entry.id === params.fileId)?.name);

  useEffect(() => {
    if (!hydrated || reviewedAt || typeof window === 'undefined') return;

    const reviewSection = document.getElementById('review-step');
    if (!reviewSection || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.35) continue;
          markWorkflowProgress(params.fileId, {
            reviewedAt: new Date().toISOString()
          });
          observer.disconnect();
          break;
        }
      },
      {
        threshold: [0.35]
      }
    );

    observer.observe(reviewSection);
    return () => observer.disconnect();
  }, [hydrated, markWorkflowProgress, params.fileId, reviewedAt]);

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
          Use this app for first-pass remediation, planning, and QA packaging. Finish the actual PDF edits and desktop validation in Acrobat or PAC before publishing.
        </p>
      </div>
      <ReportStatePanel fileId={params.fileId} />
      <RevisionDeltaPanel fileId={params.fileId} />
      <WorkflowStepper fileId={params.fileId} />

      <div id="download-step" className="scroll-mt-24">
        <CompareActions fileId={params.fileId} />
      </div>

      <div id="next-steps-step" className="scroll-mt-24">
        <NextStepsPanel fileId={params.fileId} />
      </div>

      <CollapsibleSection
        id="review-step"
        title="Review previews and findings"
        subtitle="Confirm the document, review the automated baseline, and use the findings below to decide what still needs manual remediation."
      >
        <div className="space-y-6">
          <EvidencePackAction fileId={params.fileId} />
          <SideBySide fileId={params.fileId} />

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <h3>Uploaded PDF findings</h3>
              <SummaryDashboard fileId={params.fileId} variant="original" />
              <IssueList fileId={params.fileId} variant="original" />
            </div>
            <div className="space-y-4">
              <h3>Remediated PDF findings</h3>
              <SummaryDashboard fileId={params.fileId} variant="remediated" />
              <IssueList fileId={params.fileId} variant="remediated" />
            </div>
          </section>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="alt-text-step"
        title="Prepare alt text updates"
        subtitle="Review detected images, draft alt text, and export a worksheet for the actual edits you will make in Acrobat, PAC, or the source file."
      >
        <AltTextWorkspace fileId={params.fileId} />
      </CollapsibleSection>

      <CollapsibleSection
        id="structure-step"
        title="Prepare structure fixes"
        subtitle="Review heading and table issues here, then apply the actual structural edits in Acrobat, PAC, or the source file."
      >
        <div className="space-y-6">
          <StructuralIntegrityPanel fileId={params.fileId} />
          <ManualStructureWorkspace fileId={params.fileId} />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="validation-step"
        title="Validate revised PDF"
        subtitle="Confirm the PDF/UA result after you apply manual revisions and upload the revised file."
      >
        <VerificationPanel fileId={params.fileId} />
      </CollapsibleSection>
    </div>
  );
}
