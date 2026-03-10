import { getVerapdfComplianceVerdict } from '@/lib/verapdf/result';
import type { FileEntry } from '@/types/file-entry';
import { getAccessibilityStatus } from './accessibility-status';
import { summarizeManualReviewState } from './manual-review';

export type WorkflowStepState = 'complete' | 'current' | 'pending' | 'blocked' | 'not-needed';

export interface WorkflowStep {
  key: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  state: WorkflowStepState;
}

interface StepDefinition extends Omit<WorkflowStep, 'state'> {
  satisfied: boolean;
  available: boolean;
  notNeeded?: boolean;
}

const structureCategories = ['Document Structure', 'Headings & Structure', 'Tables'];

function assignStepStates(steps: StepDefinition[]): WorkflowStep[] {
  let assignedCurrent = false;

  return steps.map((step) => {
    if (step.notNeeded) return { ...step, state: 'not-needed' };
    if (step.satisfied) return { ...step, state: 'complete' };
    if (!assignedCurrent && step.available) {
      assignedCurrent = true;
      return { ...step, state: 'current' };
    }
    return { ...step, state: step.available ? 'pending' : 'blocked' };
  });
}

export function buildWorkflowSteps(file: FileEntry | undefined): WorkflowStep[] {
  const status = getAccessibilityStatus(file);
  const manualReview = summarizeManualReviewState(file);
  const hasRemediatedPdf = Boolean(file?.remediatedBytes);
  const hasDownloadedPdf = Boolean(file?.workflowProgress?.downloadedAt);
  const hasReviewedFindings = Boolean(file?.workflowProgress?.reviewedAt);
  const remediatedFindings = file?.postRemediationAudit?.findings ?? [];
  const structureFindingCount = remediatedFindings.filter((finding) => structureCategories.includes(finding.category)).length;
  const needsAltTextPlan =
    manualReview.altText.totalImages > 0 &&
    (manualReview.altText.missingCount > 0 || manualReview.altText.editedCount > 0);
  const altTextPrepared = Boolean(file?.workflowProgress?.altTextPreparedAt) || manualReview.altText.editedCount > 0;
  const needsStructurePlan =
    file?.remediationMode === 'analysis-only' ||
    structureFindingCount > 0 ||
    manualReview.structure.tableSuggestions > 0;
  const structurePrepared =
    Boolean(file?.workflowProgress?.structurePreparedAt) ||
    manualReview.structure.headingOverrides > 0 ||
    manualReview.structure.reviewedTables > 0;
  const hasValidationResult = typeof getVerapdfComplianceVerdict(file?.verapdfResult) === 'boolean';
  const revalidationHref = file ? `/app?revalidateFor=${encodeURIComponent(file.id)}#upload-revised-pdf` : '/app#upload-revised-pdf';

  return assignStepStates([
    {
      key: 'download',
      title: 'Download remediated PDF',
      description: hasDownloadedPdf
        ? 'The updated PDF has been downloaded from this workflow. Re-download it anytime if you need another copy.'
        : 'Go to the download panel below and click Download remediated PDF before you move on to review.',
      href: '#download-step',
      actionLabel: hasRemediatedPdf ? 'Go to download panel' : 'Wait for updated PDF',
      satisfied: hasDownloadedPdf,
      available: true
    },
    {
      key: 'review',
      title: 'Review preview and findings',
      description: hasReviewedFindings
        ? 'You reviewed the in-browser preview and findings for this file.'
        : 'After the PDF is downloaded, confirm the correct document and inspect the automated findings in this page.',
      href: '#review-step',
      actionLabel: 'Open review section',
      satisfied: hasReviewedFindings,
      available: hasDownloadedPdf
    },
    {
      key: 'alt-text',
      title: 'Prepare alt text updates',
      description: !needsAltTextPlan
        ? 'No image alt-text planning is needed in this browser for the current file.'
        : altTextPrepared
          ? 'Alt-text updates have been drafted or exported. Apply them in Acrobat, PAC, or the source document before re-validation.'
          : `${manualReview.altText.missingCount} of ${manualReview.altText.totalImages} images still need alt-text coverage. Draft updates here or export a worksheet.`,
      href: '#alt-text-step',
      actionLabel: 'Open alt text workspace',
      satisfied: needsAltTextPlan && altTextPrepared,
      available: hasReviewedFindings,
      notNeeded: !needsAltTextPlan
    },
    {
      key: 'structure',
      title: 'Prepare structure fixes',
      description: !needsStructurePlan
        ? 'No heading or table planning is currently required in this browser.'
        : structurePrepared
          ? 'Structure edits have been planned or exported. Apply them in Acrobat, PAC, or the source file before re-validation.'
          : file?.remediationMode === 'analysis-only'
            ? 'This file still needs manual structural tagging. Use the workspace below to plan the next pass before editing in Acrobat or PAC.'
            : `${structureFindingCount} structure findings and ${manualReview.structure.tableSuggestions} table suggestions still need review or planning.`,
      href: '#structure-step',
      actionLabel: 'Open structure workspace',
      satisfied: needsStructurePlan && structurePrepared,
      available: hasReviewedFindings,
      notNeeded: !needsStructurePlan
    },
    {
      key: 'validation',
      title: 'Validate revised PDF',
      description: manualReview.pendingRevalidation
        ? 'Apply your saved plan in Acrobat, PAC, or the source document, then upload the revised PDF for another validation pass.'
        : getVerapdfComplianceVerdict(file?.verapdfResult) === true
          ? 'The latest validated PDF/UA result passed for the current file.'
          : 'Review the latest PDF/UA result after manual revisions and run another pass if failures remain.',
      href: manualReview.pendingRevalidation ? revalidationHref : '#validation-step',
      actionLabel: manualReview.pendingRevalidation ? 'Upload revised PDF' : 'Open validation panel',
      satisfied: !manualReview.pendingRevalidation && getVerapdfComplianceVerdict(file?.verapdfResult) === true,
      available: hasDownloadedPdf || hasValidationResult
    },
    {
      key: 'publish',
      title: 'Publish',
      description:
        status.status === 'accessible'
          ? 'The current validated file is ready for your final spot-check before publishing.'
          : 'Publish only after the validated status reads Accessible and your final desktop QA is complete.',
      href: '#next-steps-step',
      actionLabel: 'Open publish guidance',
      satisfied: status.status === 'accessible',
      available: hasDownloadedPdf
    }
  ]);
}
