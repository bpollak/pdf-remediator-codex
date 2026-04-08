'use client';

import Link from 'next/link';
import { HelpTip } from './HelpTip';
import { useAppStore } from '@/stores/app-store';
import type { RemediationStopReason } from '@/lib/remediate/loop';
import { getAccessibilityStatus } from '@/lib/report/accessibility-status';
import { summarizeManualReviewState } from '@/lib/report/manual-review';
import { formatTimestamp } from '@/lib/report/time-format';
import { getVerapdfComplianceVerdict } from '@/lib/verapdf/result';

function metricValue(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : 'n/a';
}

function stopReasonLabel(reason: RemediationStopReason | undefined): string | null {
  if (!reason) return null;
  if (reason === 'compliant') return 'Process stopped: no failed rules were reported.';
  if (reason === 'service_unavailable') return 'Process stopped: veraPDF service is unavailable.';
  if (reason === 'no_change') return 'Process stopped: another attempt produced the same file.';
  if (reason === 'no_improvement') return 'Process stopped: failed checks did not improve.';
  if (reason === 'max_iterations') return 'Process stopped: reached the maximum number of attempts.';
  return null;
}

function neutralStatement(statement: string | undefined): string | null {
  if (!statement) return null;
  if (/\bcompliant\b/i.test(statement)) return null;
  return statement;
}

function neutralReason(reason: string | undefined): string | null {
  if (!reason) return null;
  if (/compliance verdict/i.test(reason)) {
    return 'veraPDF returned detailed counts but no final pass/fail label.';
  }
  return reason;
}

export function VerificationPanel({ fileId }: { fileId: string }) {
  const file = useAppStore((s) => s.files.find((f) => f.id === fileId));
  const verification = file?.verapdfResult;
  const iterations = file?.remediationIterations ?? [];
  const stopReason = file?.remediationStopReason;
  const stopReasonMessage = stopReasonLabel(stopReason);
  const statement = neutralStatement(verification?.statement);
  const reason = neutralReason(verification?.reason);
  const accessibilityStatus = getAccessibilityStatus(file);
  const verificationVerdict = getVerapdfComplianceVerdict(verification);
  const manualReview = summarizeManualReviewState(file);
  const remediatedGeneratedAt = formatTimestamp(file?.remediationCompletedAt);
  const validationUpdatedAt = formatTimestamp(file?.validationCompletedAt);
  const draftUpdatedAt = formatTimestamp(manualReview.updatedAt);
  const revalidationHref = file
    ? `/app?revalidateFor=${encodeURIComponent(file.id)}#upload-revised-pdf`
    : '/app#upload-revised-pdf';
  const validationLabel =
    verificationVerdict === true
      ? 'Passed Independent accessibility check'
      : accessibilityStatus.status === 'verification-unavailable'
        ? 'Validation unavailable'
        : verification?.attempted
          ? 'Not yet passed Independent accessibility check'
          : 'Validation not available yet';

  if (!verification) {
    return (
      <section className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
        <h2>
          Independent accessibility check
          <HelpTip label="independent check">
            PDF/UA is the international standard for accessible PDFs. This check uses an independent tool (veraPDF) to verify your PDF meets that standard. It runs separately from this app&apos;s own checks, providing a second opinion.
          </HelpTip>
        </h2>
        <p className="mt-2 text-sm text-[var(--ucsd-text)]">
          This is an independent check against the international PDF accessibility standard (PDF/UA). It runs separately from this app&apos;s own checks.
        </p>
        <p className="mt-2 text-sm font-medium text-[var(--ucsd-navy)]">Validation result: {validationLabel}</p>
        <p className="mt-2 text-sm text-[var(--ucsd-text)]">
          Draft changes you make in this app won&apos;t update these results. Upload a revised PDF after making manual fixes to re-check.
        </p>
        <div className="mt-3 rounded border border-[rgba(24,43,73,0.12)] bg-slate-50 p-3 text-sm text-[var(--ucsd-text)]">
          {remediatedGeneratedAt ? <p>Current remediated PDF generated: {remediatedGeneratedAt}</p> : null}
          {draftUpdatedAt ? <p className="mt-1">Latest saved draft edit: {draftUpdatedAt}</p> : null}
        </div>
        {manualReview.pendingRevalidation ? (
          <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p>You have draft changes that haven&apos;t been verified yet. Upload a revised PDF to run another check.</p>
            <Link
              href={revalidationHref}
              className="mt-3 inline-flex items-center rounded-md bg-[var(--ucsd-blue)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--ucsd-navy)]"
            >
              Upload revised PDF for validation
            </Link>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
      <h2>
          Independent accessibility check
          <HelpTip label="independent check">
            PDF/UA is the international standard for accessible PDFs. This check uses an independent tool (veraPDF) to verify your PDF meets that standard. It runs separately from this app&apos;s own checks, providing a second opinion.
          </HelpTip>
        </h2>

      <p className="mt-2 text-sm text-[var(--ucsd-text)]">
        This is an independent check against the international PDF accessibility standard (PDF/UA). These results apply to your current improved PDF.
      </p>
      <p className="mt-2 text-sm font-medium text-[var(--ucsd-navy)]">Validation result: {validationLabel}</p>
      <p className="mt-2 text-sm text-[var(--ucsd-text)]">
        Draft changes you make in this app won&apos;t update these results. Upload a revised PDF after making manual fixes to re-check.
      </p>
      <div className="mt-3 rounded border border-[rgba(24,43,73,0.12)] bg-slate-50 p-3 text-sm text-[var(--ucsd-text)]">
        {remediatedGeneratedAt ? <p>Current remediated PDF generated: {remediatedGeneratedAt}</p> : null}
        {validationUpdatedAt ? <p className="mt-1">Latest validation result recorded: {validationUpdatedAt}</p> : null}
        {draftUpdatedAt ? <p className="mt-1">Latest saved draft edit: {draftUpdatedAt}</p> : null}
      </div>
      {manualReview.pendingRevalidation ? (
        <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>You have draft changes that haven&apos;t been verified yet. Upload a revised PDF to run another check.</p>
          <Link
            href={revalidationHref}
            className="mt-3 inline-flex items-center rounded-md bg-[var(--ucsd-blue)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--ucsd-navy)]"
          >
            Upload revised PDF for validation
          </Link>
        </div>
      ) : null}

      <p className="mt-2 text-sm text-[var(--ucsd-text)]">
        Standard checked: {verification.profile ?? 'not reported'}
      </p>

      {iterations.length > 0 ? (
        <p className="mt-2 text-sm text-[var(--ucsd-text)]">
          Automatic fix attempts: {iterations.length}
        </p>
      ) : null}

      {verification.summary ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm text-[var(--ucsd-text)]">
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Passed rules</dt>
            <dd>{metricValue(verification.summary.passedRules)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Failed rules</dt>
            <dd>{metricValue(verification.summary.failedRules)}</dd>
          </div>
        </dl>
      ) : null}
      {verification.summary ? (
        <p className="mt-2 text-sm text-[var(--ucsd-text)]">Next step: prioritize the failed rules before publishing.</p>
      ) : null}

      {statement ? (
        <p className="mt-3 text-sm text-[var(--ucsd-text)]">{statement}</p>
      ) : null}

      {reason ? (
        <p className="mt-3 text-sm text-[var(--ucsd-text)]">{reason}</p>
      ) : null}

      {stopReasonMessage ? (
        <p className="mt-2 text-sm text-[var(--ucsd-text)]">{stopReasonMessage}</p>
      ) : null}
    </section>
  );
}
