'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/stores/app-store';
import { getAccessibilityStatus } from '@/lib/report/accessibility-status';
import { summarizeManualReviewState } from '@/lib/report/manual-review';

type WorkflowState = 'complete' | 'current' | 'pending' | 'blocked';

interface StepDefinition {
  key: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  complete: boolean;
  available: boolean;
}

interface WorkflowStep extends StepDefinition {
  state: WorkflowState;
}

const stateLabel: Record<WorkflowState, string> = {
  complete: 'Complete',
  current: 'Current step',
  pending: 'Pending',
  blocked: 'Blocked'
};

const stateClasses: Record<WorkflowState, string> = {
  complete: 'border-green-200 bg-green-50',
  current: 'border-[var(--ucsd-blue)] bg-[rgba(0,98,155,0.06)] ring-2 ring-[rgba(0,98,155,0.15)]',
  pending: 'border-[rgba(24,43,73,0.15)] bg-white',
  blocked: 'border-gray-200 bg-gray-50'
};

function assignStepStates(steps: StepDefinition[]): WorkflowStep[] {
  let assignedCurrent = false;

  return steps.map((step) => {
    if (step.complete) return { ...step, state: 'complete' };
    if (!assignedCurrent && step.available) {
      assignedCurrent = true;
      return { ...step, state: 'current' };
    }
    return { ...step, state: step.available ? 'pending' : 'blocked' };
  });
}

export function WorkflowStepper({ fileId }: { fileId: string }) {
  const file = useAppStore((state) => state.files.find((entry) => entry.id === fileId));

  const steps = useMemo(() => {
    const status = getAccessibilityStatus(file);
    const manualReview = summarizeManualReviewState(file);
    const hasRemediatedPdf = Boolean(file?.remediatedBytes);
    const remediatedFindings = file?.postRemediationAudit?.findings ?? [];
    const structureFindingCount = remediatedFindings.filter((finding) =>
      ['Document Structure', 'Headings & Structure', 'Tables'].includes(finding.category)
    ).length;
    const hasValidationResult = typeof file?.verapdfResult?.compliant === 'boolean';
    const revalidationHref = file ? `/app?revalidateFor=${encodeURIComponent(file.id)}#upload-revised-pdf` : '/app#upload-revised-pdf';

    return assignStepStates([
      {
        key: 'download',
        title: 'Download remediated PDF',
        description: 'Get the updated PDF so you can review it in Acrobat or PAC.',
        href: '#download-step',
        actionLabel: hasRemediatedPdf ? 'Open download step' : 'Wait for updated PDF',
        complete: hasRemediatedPdf,
        available: true
      },
      {
        key: 'review',
        title: 'Review preview and findings',
        description: 'Confirm the correct document and inspect the automated findings.',
        href: '#review-step',
        actionLabel: 'Open review section',
        complete: hasRemediatedPdf && remediatedFindings.length === 0,
        available: hasRemediatedPdf
      },
      {
        key: 'alt-text',
        title: 'Fix alt text',
        description: 'Use the image list to prepare human-reviewed alt text updates.',
        href: '#alt-text-step',
        actionLabel: 'Open alt text workspace',
        complete:
          hasRemediatedPdf &&
          (manualReview.altText.totalImages === 0 || manualReview.altText.missingCount === 0),
        available: hasRemediatedPdf
      },
      {
        key: 'structure',
        title: 'Fix structure',
        description: 'Review heading and table issues, then finish structural edits in Acrobat or PAC.',
        href: '#structure-step',
        actionLabel: 'Open structure workspace',
        complete:
          hasRemediatedPdf &&
          file?.remediationMode !== 'analysis-only' &&
          structureFindingCount === 0 &&
          (manualReview.structure.tableSuggestions === 0 ||
            manualReview.structure.reviewedTables === manualReview.structure.tableSuggestions),
        available: hasRemediatedPdf
      },
      {
        key: 'validation',
        title: 'Run validation',
        description: manualReview.pendingRevalidation
          ? 'Manual draft changes are waiting for a revised PDF and validation pass.'
          : 'Confirm the PDF/UA result after manual revisions.',
        href: manualReview.pendingRevalidation ? revalidationHref : '#validation-step',
        actionLabel: manualReview.pendingRevalidation ? 'Upload revised PDF for validation' : 'Open validation panel',
        complete: !manualReview.pendingRevalidation && file?.verapdfResult?.compliant === true,
        available: hasRemediatedPdf || hasValidationResult
      },
      {
        key: 'publish',
        title: 'Publish',
        description: 'Publish only when the document status reads Accessible.',
        href: '#next-steps-step',
        actionLabel: 'Open publish guidance',
        complete: status.status === 'accessible',
        available: hasRemediatedPdf
      }
    ]);
  }, [file]);

  return (
    <section className="space-y-3 rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
      <div>
        <h2>Remediation workflow</h2>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">
          Follow these steps in order. The current step is highlighted and announced to assistive technology.
        </p>
      </div>

      <ol className="grid gap-3 lg:grid-cols-2" aria-label="Accessibility remediation workflow">
        {steps.map((step, index) => (
          <li
            key={step.key}
            aria-current={step.state === 'current' ? 'step' : undefined}
            className={`rounded border p-3 shadow-sm ${stateClasses[step.state]}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ucsd-text)]">
                  Step {index + 1}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-[var(--ucsd-navy)]">{step.title}</h3>
              </div>
              <span className="rounded-full border border-current/15 bg-white/80 px-2 py-0.5 text-xs font-medium text-[var(--ucsd-text)]">
                {stateLabel[step.state]}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--ucsd-text)]">{step.description}</p>
            <a
              href={step.href}
              className={`mt-3 inline-flex items-center rounded-md px-3 py-2 text-sm font-medium transition ${
                step.state === 'blocked'
                  ? 'pointer-events-none bg-gray-200 text-gray-500'
                  : 'bg-[var(--ucsd-blue)] text-white hover:bg-[var(--ucsd-navy)]'
              }`}
              aria-disabled={step.state === 'blocked'}
            >
              {step.actionLabel}
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
