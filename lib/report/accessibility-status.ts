import type { FileEntry } from '@/types/file-entry';
import { computeDisplayedAutomatedScore } from './display-score';
import { hasPendingManualReviewChanges } from './manual-review';

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
}

function isVerificationUnavailable(reason: string | undefined): boolean {
  if (!reason) return false;
  return /unavailable|failed to contact|timed out|not enabled|not configured/i.test(reason);
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function remainLabel(count: number, noun: string): string {
  return `${pluralize(count, noun)} ${count === 1 ? 'remains' : 'remain'}`;
}

export function getAccessibilityStatus(file: FileEntry | undefined): AccessibilityStatusResult {
  if (!file || file.status === 'queued' || file.status === 'parsing' || file.status === 'ocr' || file.status === 'auditing' || file.status === 'audited' || file.status === 'remediating') {
    return {
      status: 'processing',
      label: 'Processing',
      message: 'Remediation is still running. Accessibility status appears after the updated PDF is ready.',
      reasons: [{ code: 'processing', label: 'Updated PDF not ready yet' }]
    };
  }

  if (file.status === 'error') {
    return {
      status: 'not-yet-accessible',
      label: 'Not yet accessible',
      message: 'Processing did not complete. Resolve the file error and run remediation again before making an accessibility decision.',
      reasons: [{ code: 'processing-error', label: 'Processing failed before completion' }]
    };
  }

  const auditResult = file.postRemediationAudit;
  const automatedScore = computeDisplayedAutomatedScore({
    auditResult,
    variant: 'remediated',
    verapdfResult: file.verapdfResult
  });

  if (!auditResult) {
    return {
      status: 'processing',
      label: 'Processing',
      message: 'Remediation finished without a complete audit snapshot. Re-run the file before making an accessibility decision.',
      reasons: [{ code: 'processing', label: 'Audit snapshot unavailable' }],
      automatedScore
    };
  }

  const reasons: AccessibilityReason[] = [];
  const remainingInternal = auditResult.findings.length;
  const failedRules = file.verapdfResult?.summary?.failedRules ?? 0;
  const failedChecks = file.verapdfResult?.summary?.failedChecks ?? 0;
  const hasPendingReviewChanges = hasPendingManualReviewChanges(file);
  const verificationUnavailable =
    !file.verapdfResult ||
    file.verapdfResult.attempted === false ||
    typeof file.verapdfResult.compliant !== 'boolean' ||
    isVerificationUnavailable(file.verapdfResult.reason);

  if (file.sourceType === 'checker-report-artifact') {
    reasons.push({
      code: 'source-artifact',
      label: 'Source looks like a checker or report PDF'
    });
  }

  if (file.remediationMode === 'analysis-only') {
    reasons.push({
      code: 'analysis-only',
      label: 'Manual structure tagging is still required'
    });
  }

  if (hasPendingReviewChanges) {
    reasons.push({
      code: 'pending-revalidation',
      label: 'Manual draft changes are waiting for re-validation'
    });
  }

  if (remainingInternal > 0) {
    reasons.push({
      code: 'internal-findings',
      label: remainLabel(remainingInternal, 'internal issue')
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
      label: 'Automated baseline is below 100%'
    });
  }

  if (verificationUnavailable) {
    return {
      status: 'verification-unavailable',
      label: 'Verification unavailable',
      message:
        'This document cannot be confirmed accessible yet because the external PDF/UA check is unavailable. Manual remediation and desktop validation are still required before publishing.',
      reasons: [...reasons, { code: 'verification-unavailable', label: 'External PDF/UA verification unavailable' }],
      automatedScore
    };
  }

  if (reasons.length > 0 || file.verapdfResult?.compliant !== true || automatedScore !== 100) {
    return {
      status: 'not-yet-accessible',
      label: 'Not yet accessible',
      message: 'Additional remediation is still required before this document can be considered accessible.',
      reasons:
        reasons.length > 0
          ? reasons
          : [
              {
                code: 'score-below-100',
                label: 'Automated baseline is below 100%'
              }
            ],
      automatedScore
    };
  }

  return {
    status: 'accessible',
    label: 'Accessible',
    message:
      'This document passed the current automated baseline and external PDF/UA verification. Complete your normal final spot-check before publishing.',
    reasons: [],
    automatedScore
  };
}
