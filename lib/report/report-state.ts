import type { FileEntry } from '@/types/file-entry';
import { getAccessibilityStatus } from './accessibility-status';
import { summarizeManualReviewState } from './manual-review';
import { getVerapdfUnavailableReason } from '@/lib/verapdf/result';

export type ReportStateTone = 'success' | 'attention' | 'info' | 'neutral';

export interface ReportStateBlock {
  title: string;
  tone: ReportStateTone;
  label: string;
  description: string;
  updatedAt?: string;
  chips: string[];
}

export interface NextActionBlock {
  tone: ReportStateTone;
  label: string;
  description: string;
  href?: string;
  actionLabel?: string;
}

export interface ReportStateSnapshot {
  validatedFile: ReportStateBlock;
  draftPlan: ReportStateBlock;
  nextAction: NextActionBlock;
}

function validatedFileTone(file: FileEntry | undefined): ReportStateTone {
  const status = getAccessibilityStatus(file).status;
  if (status === 'accessible') return 'success';
  if (status === 'processing') return 'neutral';
  if (status === 'verification-unavailable') return 'info';
  return 'attention';
}

export function getReportStateSnapshot(file: FileEntry | undefined): ReportStateSnapshot {
  const accessibility = getAccessibilityStatus(file);
  const manualReview = summarizeManualReviewState(file);
  const structureEditCount = manualReview.structure.headingOverrides + manualReview.structure.reviewedTables;
  const draftChangeCount = manualReview.altText.editedCount + structureEditCount;
  const failedRules = file?.verapdfResult?.summary?.failedRules;
  const failedChecks = file?.verapdfResult?.summary?.failedChecks;
  const remediatedFindings = file?.postRemediationAudit?.findings.length ?? 0;
  const hasAuditSnapshot = Boolean(file?.postRemediationAudit);
  const hasValidationSnapshot = Boolean(file?.verapdfResult);
  const verificationUnavailableReason = getVerapdfUnavailableReason(file?.verapdfResult);

  const validatedFile: ReportStateBlock = {
    title: 'Current validated file',
    tone: validatedFileTone(file),
    label: accessibility.label,
    description: accessibility.message,
    updatedAt: file?.validationCompletedAt ?? file?.remediationCompletedAt,
    chips: [
      hasAuditSnapshot
        ? remediatedFindings > 0
          ? `${remediatedFindings} internal issues remain`
          : 'No internal issues remain'
        : 'Audit snapshot pending',
      hasValidationSnapshot
        ? verificationUnavailableReason
          ? 'PDF/UA verdict unavailable'
          : typeof failedRules === 'number'
            ? failedRules > 0
              ? `${failedRules} PDF/UA rules failed`
              : 'No failed PDF/UA rules'
            : 'PDF/UA rule counts unavailable'
        : 'PDF/UA result pending',
      hasValidationSnapshot
        ? verificationUnavailableReason
          ? 'PDF/UA check details unavailable'
          : typeof failedChecks === 'number'
            ? failedChecks > 0
              ? `${failedChecks} PDF/UA checks failed`
              : 'No failed PDF/UA checks'
            : 'PDF/UA check counts unavailable'
        : 'PDF/UA check details pending'
    ]
  };

  const draftPlan: ReportStateBlock = manualReview.pendingRevalidation
    ? {
        title: 'Saved draft plan',
        tone: 'attention',
        label: 'Draft changes waiting for re-validation',
        description: 'Manual workspace edits are saved here, but they do not change the validated file until you upload a revised PDF.',
        updatedAt: manualReview.updatedAt,
        chips: [
          `${manualReview.altText.editedCount} alt-text edits`,
          `${structureEditCount} structure decisions`,
          `${draftChangeCount} total draft changes`
        ]
      }
    : {
        title: 'Saved draft plan',
        tone: manualReview.updatedAt ? 'success' : 'neutral',
        label: manualReview.updatedAt ? 'No pending draft blockers' : 'No saved draft edits yet',
        description: manualReview.updatedAt
          ? 'Saved draft work is already reflected in the current validated state, or no new draft changes are waiting for upload.'
          : 'Use the manual workspaces when you need to draft alt-text or structure follow-up before re-validating.',
        updatedAt: manualReview.updatedAt,
        chips: manualReview.updatedAt
          ? [
              `${manualReview.altText.editedCount} alt-text edits saved`,
              `${structureEditCount} structure decisions saved`
            ]
          : ['Alt-text workspace available', 'Structure workspace available']
      };

  let nextAction: NextActionBlock;
  if (!file || accessibility.status === 'processing') {
    nextAction = {
      tone: 'neutral',
      label: 'Wait for remediation to finish',
      description: 'The updated PDF and validation state will appear here after processing completes.'
    };
  } else if (manualReview.pendingRevalidation) {
    nextAction = {
      tone: 'attention',
      label: 'Upload revised PDF for validation',
      description: 'Apply your saved draft edits in Acrobat, PAC, or the source document, then upload the revised PDF to refresh status and validation results.',
      href: `/app?revalidateFor=${encodeURIComponent(file.id)}#upload-revised-pdf`,
      actionLabel: 'Upload revised PDF'
    };
  } else if (accessibility.status === 'accessible') {
    nextAction = {
      tone: 'success',
      label: 'Final spot-check and publish',
      description: 'The current validated file passed the automated baseline and PDF/UA check. Complete your normal final QA spot-check before release.',
      href: '#next-steps-step',
      actionLabel: 'Review publish guidance'
    };
  } else if ((typeof failedRules === 'number' && failedRules > 0) || (typeof failedChecks === 'number' && failedChecks > 0)) {
    nextAction = {
      tone: 'attention',
      label: 'Resolve remaining PDF/UA failures',
      description: 'Finish manual remediation in Acrobat or PAC, then run another revised upload so the validation result can improve.',
      href: '#validation-step',
      actionLabel: 'Open validation details'
    };
  } else if (remediatedFindings > 0) {
    nextAction = {
      tone: 'attention',
      label: 'Review remaining findings',
      description: 'The remediated PDF still has internal findings to work through. Use the findings list and workspaces below to finish the next pass.',
      href: '#review-step',
      actionLabel: 'Open findings'
    };
  } else if (accessibility.status === 'verification-unavailable') {
    nextAction = {
      tone: 'info',
      label: 'Run desktop validation before publishing',
      description: 'External PDF/UA verification was unavailable. Complete a desktop validation pass in Acrobat or PAC before treating the file as accessible.',
      href: '#validation-step',
      actionLabel: 'Open validation details'
    };
  } else {
    nextAction = {
      tone: 'attention',
      label: 'Continue manual review',
      description: 'Check the findings, workspaces, and publish guidance to decide what needs another remediation pass.',
      href: '#review-step',
      actionLabel: 'Open review workflow'
    };
  }

  return {
    validatedFile,
    draftPlan,
    nextAction
  };
}
