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
import { ImprovementSummary } from '@/components/report/ImprovementSummary';
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
        <h1>Accessibility Improvement Workflow</h1>
        <p className="text-sm text-[var(--ucsd-text)]">Loading saved results...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="break-words">Accessibility Improvement Workflow</h1>
        <p className="break-words text-sm text-[var(--ucsd-text)]">Document: {documentName ?? 'Uploaded PDF'}</p>
        <p className="text-sm text-[var(--ucsd-text)]">
          Follow the steps below to review and finish improving your PDF. Some fixes have already been applied automatically.
        </p>
      </div>
      <ImprovementSummary fileId={params.fileId} />
      <WorkflowStepper fileId={params.fileId} />
      <CollapsibleSection
        id="status-detail"
        title="Detailed status"
        subtitle="Expanded view of your PDF's current validation state, draft plan, and revision history."
      >
        <div className="space-y-4">
          <ReportStatePanel fileId={params.fileId} />
          <RevisionDeltaPanel fileId={params.fileId} />
        </div>
      </CollapsibleSection>

      <div id="download-step" className="scroll-mt-24">
        <CompareActions fileId={params.fileId} />
      </div>

      <div id="next-steps-step" className="scroll-mt-24">
        <NextStepsPanel fileId={params.fileId} />
      </div>

      <CollapsibleSection
        id="review-step"
        title="Review previews and findings"
        subtitle="Compare your original and improved PDFs side by side, and review the detailed findings."
      >
        <div className="space-y-6">
          <EvidencePackAction fileId={params.fileId} />
          <SideBySide fileId={params.fileId} />

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <h3>Original PDF</h3>
              <SummaryDashboard fileId={params.fileId} variant="original" />
              <IssueList fileId={params.fileId} variant="original" />
            </div>
            <div className="space-y-4">
              <h3>Improved PDF</h3>
              <SummaryDashboard fileId={params.fileId} variant="remediated" />
              <IssueList fileId={params.fileId} variant="remediated" />
            </div>
          </section>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="alt-text-step"
        title="Prepare alt text updates"
        subtitle="Review images that need descriptive text. You can draft descriptions here and export them for use in your editing tool."
      >
        <AltTextWorkspace fileId={params.fileId} />
      </CollapsibleSection>

      <CollapsibleSection
        id="structure-step"
        title="Prepare structure fixes"
        subtitle="Review heading and table issues. Plan your fixes here, then apply them in your editing tool or the original document."
      >
        <div className="space-y-6">
          <StructuralIntegrityPanel fileId={params.fileId} />
          <ManualStructureWorkspace fileId={params.fileId} />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="validation-step"
        title="Validate revised PDF"
        subtitle="After making manual fixes, upload your revised PDF here to verify it passes accessibility checks."
      >
        <VerificationPanel fileId={params.fileId} />
      </CollapsibleSection>
    </div>
  );
}
