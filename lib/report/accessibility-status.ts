import type { FileEntry } from '@/types/file-entry';
import { computeDisplayedAutomatedScore } from './display-score';
import { summarizeNotChecked } from './remediation-diff';
import { hasPendingManualReviewChanges, summarizeManualCompletion } from './manual-review';
import { getVerapdfComplianceVerdict, getVerapdfUnavailableReason } from '@/lib/verapdf/result';
import { redactDiagnostic } from './diagnostics';

export type AccessibilityStatus =
  | 'accessible'
  | 'not-yet-accessible'
  | 'verification-unavailable'
  | 'processing';

export type AccessibilityReasonCode =
  | 'processing'
  | 'processing-error'
  | 'score-below-100'
  | 'internal-findings'
  | 'failed-rules'
  | 'failed-checks'
  | 'not-checked'
  | 'analysis-only'
  | 'source-artifact'
  | 'pending-revalidation'
  | 'verification-unavailable';

export interface AccessibilityReason {
  code: AccessibilityReasonCode;
  label: string;
}

export interface AccessibilityStatusResult {
  status: AccessibilityStatus;
  label: string;
  message: string;
  reasons: AccessibilityReason[];
  automatedScore?: number;
  /** Raw diagnostic for "Details for support", with server setting names removed. */
  detail?: string;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function getAccessibilityStatus(file: FileEntry | undefined): AccessibilityStatusResult {
  if (!file || file.status === 'queued' || file.status === 'parsing' || file.status === 'ocr' || file.status === 'auditing' || file.status === 'audited' || file.status === 'remediating') {
    return {
      status: 'processing',
      label: 'Processing',
      message: "We're still working on this PDF. The result appears here when it's ready.",
      reasons: [{ code: 'processing', label: 'Updated PDF not ready yet' }]
    };
  }

  if (file.status === 'error') {
    return {
      status: 'not-yet-accessible',
      label: 'Not ready to publish',
      // file.error is already plain-language copy from the queue (for example
      // the signed or password-protected explanations).
      message: file.error
        ? `${file.error} This PDF has not been checked.`
        : 'Processing did not finish, so this PDF has not been checked. Use Try again on the upload page.',
      reasons: [{ code: 'processing-error', label: 'Processing did not finish' }]
    };
  }

  const auditResult = file.postRemediationAudit;
  const automatedScore = computeDisplayedAutomatedScore({
    auditResult,
    variant: 'remediated',
    verapdfResult: file.verapdfResult,
    remediationMode: file.remediationMode
  });

  if (!auditResult) {
    return {
      status: 'processing',
      label: 'Processing',
      message: 'Processing finished without a complete check. Upload the PDF again before deciding whether to publish it.',
      reasons: [{ code: 'processing', label: 'Check results unavailable' }],
      automatedScore
    };
  }

  const reasons: AccessibilityReason[] = [];
  const remainingInternal = auditResult.findings.length;
  const notChecked = summarizeNotChecked(auditResult);
  const failedRules = file.verapdfResult?.summary?.failedRules ?? 0;
  const failedChecks = file.verapdfResult?.summary?.failedChecks ?? 0;
  const hasPendingReviewChanges = hasPendingManualReviewChanges(file);
  const verificationVerdict = getVerapdfComplianceVerdict(file.verapdfResult);
  const verificationUnavailableReason = getVerapdfUnavailableReason(file.verapdfResult);
  const verificationUnavailable = Boolean(verificationUnavailableReason);

  if (file.sourceType === 'checker-report-artifact') {
    reasons.push({
      code: 'source-artifact',
      label: 'Looks like a checker or report PDF, not a document to publish'
    });
  }

  if (file.remediationMode === 'analysis-only') {
    reasons.push({
      code: 'analysis-only',
      label: 'Hidden structure (tags) still needs to be added'
    });
  }

  if (hasPendingReviewChanges) {
    reasons.push({
      code: 'pending-revalidation',
      label: 'Your changes have not been checked yet'
    });
  }

  if (remainingInternal > 0) {
    reasons.push({
      code: 'internal-findings',
      label: `Our checks found ${pluralize(remainingInternal, 'problem')} still in the PDF`
    });
  }

  if (notChecked.length > 0) {
    reasons.push({
      code: 'not-checked',
      label: `Could not check: ${notChecked.join(', ')}`
    });
  }

  if (failedRules > 0) {
    reasons.push({
      code: 'failed-rules',
      label: `${pluralize(failedRules, 'PDF/UA rule')} failed`
    });
  }

  if (failedChecks > 0) {
    reasons.push({
      code: 'failed-checks',
      label: `${pluralize(failedChecks, 'PDF/UA check')} failed`
    });
  }

  if (typeof automatedScore === 'number' && automatedScore < 100 && reasons.length === 0) {
    reasons.push({
      code: 'score-below-100',
      label: 'Automated score is below 100%'
    });
  }

  if (verificationUnavailable) {
    return {
      status: 'verification-unavailable',
      label: 'Final check unavailable',
      message: 'Our final automated check (veraPDF) did not run. Check the PDF in PAC or Acrobat before publishing.',
      reasons: [...reasons, { code: 'verification-unavailable', label: 'Final automated check unavailable' }],
      automatedScore,
      detail: redactDiagnostic(verificationUnavailableReason)
    };
  }

  if (reasons.length > 0 || verificationVerdict !== true || automatedScore !== 100) {
    return {
      status: 'not-yet-accessible',
      label: 'Not ready to publish',
      message: 'This PDF still has problems to fix before you publish it.',
      reasons:
        reasons.length > 0
          ? reasons
          : [
              {
                code: 'score-below-100',
                label: 'Automated score is below 100%'
              }
            ],
      automatedScore
    };
  }

  // No automated tool can certify accessibility, so the best state says so.
  return {
    status: 'accessible',
    label: 'Passed automated checks — a person still needs to review it',
    message:
      'Every automated check passed. No tool can confirm a PDF is fully accessible, so before publishing, open it and check that the reading order, headings and image descriptions make sense.',
    reasons: [],
    automatedScore
  };
}

export type ReadinessBlocker =
  | 'processing'
  | 'processing-error'
  | 'analysis-only'
  | 'checklist'
  | 'revalidation'
  | 'verification-unavailable'
  | 'source-artifact'
  | 'not-checked'
  | 'remaining-issues'
  | 'none';

export interface PublishReadiness {
  status: AccessibilityStatus;
  /** Short answer to "Is this PDF ready to publish?". */
  verdict: string;
  /** One or two sentences naming what is actually in the way. */
  message: string;
  blocker: ReadinessBlocker;
  /** Required checklist items still open. */
  checklistRemaining: number;
}

/**
 * The results-page banner. It agrees with the checklist and names the one
 * thing actually in the way, in the order the user has to deal with them.
 */
export function getPublishReadiness(file: FileEntry | undefined): PublishReadiness {
  const status = getAccessibilityStatus(file);
  const completion = summarizeManualCompletion(file);
  const checklistRemaining = Math.max(completion.total - completion.completed, 0);
  const has = (code: AccessibilityReasonCode) => status.reasons.some((reason) => reason.code === code);
  const base = { status: status.status, checklistRemaining };

  if (status.status === 'processing') {
    return { ...base, verdict: 'Still processing', message: status.message, blocker: 'processing' };
  }
  if (has('processing-error')) {
    return { ...base, verdict: 'Not yet', message: status.message, blocker: 'processing-error' };
  }
  if (has('source-artifact')) {
    return {
      ...base,
      verdict: 'Not yet',
      message:
        'This looks like a checker or report PDF rather than a document you would publish. Upload the original document instead.',
      blocker: 'source-artifact'
    };
  }
  if (has('analysis-only') && checklistRemaining > 0) {
    return {
      ...base,
      verdict: 'Not yet',
      message:
        "We couldn't add the hidden structure (tags) that screen readers need. Fix it in the source file (Word, PowerPoint, Google Docs) and export again as a tagged PDF, or add tags in Acrobat Pro.",
      blocker: 'analysis-only'
    };
  }
  if (checklistRemaining > 0) {
    return {
      ...base,
      verdict: 'Not yet',
      message: `${checklistRemaining === 1 ? '1 checklist item is' : `${checklistRemaining} checklist items are`} still open. Work through the checklist below before you publish.`,
      blocker: 'checklist'
    };
  }
  if (has('pending-revalidation')) {
    return {
      ...base,
      verdict: 'Not yet',
      message: 'Checklist done. Upload the revised PDF so we can confirm the fixes.',
      blocker: 'revalidation'
    };
  }
  if (status.status === 'verification-unavailable') {
    return {
      ...base,
      verdict: 'Not confirmed',
      message:
        'Our final automated check is unavailable right now. You can download the PDF, but check it in PAC or Acrobat before publishing.',
      blocker: 'verification-unavailable'
    };
  }
  if (has('internal-findings') || has('failed-rules') || has('failed-checks') || has('score-below-100')) {
    return {
      ...base,
      verdict: 'Not yet',
      message:
        'Our automated checks still found problems. See “What’s still left” below, fix them in the source file or Acrobat Pro, then upload the revised PDF.',
      blocker: 'remaining-issues'
    };
  }
  if (has('not-checked')) {
    const label = status.reasons.find((reason) => reason.code === 'not-checked')?.label ?? '';
    return {
      ...base,
      verdict: 'Not yet',
      message: `Some checks couldn’t run on this file (${label.replace(/^Could not check: /, '')}). Check these yourself, or ask accessibility staff, before publishing.`,
      blocker: 'not-checked'
    };
  }
  return { ...base, verdict: status.label, message: status.message, blocker: 'none' };
}
