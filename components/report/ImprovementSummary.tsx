'use client';

import { useAppStore } from '@/stores/app-store';
import { computeDisplayedAutomatedScore } from '@/lib/report/display-score';

export function ImprovementSummary({ fileId }: { fileId: string }) {
  const file = useAppStore((s) => s.files.find((f) => f.id === fileId));
  const originalAudit = file?.auditResult;
  const remediatedAudit = file?.postRemediationAudit;

  if (!originalAudit || !remediatedAudit) return null;

  const originalScore = originalAudit.score;
  const remediatedScore = computeDisplayedAutomatedScore({
    auditResult: remediatedAudit,
    variant: 'remediated',
    verapdfResult: file?.verapdfResult
  }) ?? remediatedAudit.score;

  const originalIssues = originalAudit.findings.length;
  const remainingIssues = remediatedAudit.findings.length;
  const fixedIssues = originalIssues - remainingIssues;
  const improved = remediatedScore > originalScore;

  if (file?.sourceType === 'checker-report-artifact') {
    return (
      <section className="rounded-lg border-2 border-amber-200 bg-amber-50 p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <svg className="h-8 w-8 shrink-0 text-amber-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.515 2.625H3.72c-1.345 0-2.188-1.458-1.515-2.625L8.485 2.495ZM10 5.25a.75.75 0 0 1 .75.75v4a.75.75 0 0 1-1.5 0V6a.75.75 0 0 1 .75-.75Zm0 8.25a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-lg font-semibold text-amber-900">
              This looks like a checker report, not the source PDF.
            </p>
            <p className="mt-0.5 text-sm text-amber-900">
              The app can analyze this file, but the resulting PDF is not publishable remediation output. Upload the original content PDF to run meaningful fixes.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (fixedIssues <= 0 && !improved) {
    return (
      <section className="rounded-lg border border-[rgba(24,43,73,0.18)] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <svg className="h-8 w-8 shrink-0 text-[var(--ucsd-blue)]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M4.5 2.75a.75.75 0 0 1 .75.75v1.344a6.5 6.5 0 1 1-1.604 6.364.75.75 0 1 1 1.408-.516 5 5 0 1 0 1.274-5.059h1.422a.75.75 0 0 1 0 1.5h-3.25a.75.75 0 0 1-.75-.75V3.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-lg font-semibold text-[var(--ucsd-navy)]">
              No additional automated fixes were found.
            </p>
            <p className="mt-0.5 text-sm text-[var(--ucsd-text)]">
              Running this PDF through the automation again did not improve the automated score. Continue with the manual completion and validation steps below.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border-2 border-green-200 bg-green-50 p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <svg className="h-8 w-8 shrink-0 text-green-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
        </svg>
        <div>
          <p className="text-lg font-semibold text-green-800">
            {remediatedScore >= 100
              ? 'All automated checks passed!'
              : fixedIssues > 0
                ? `We automatically fixed ${fixedIssues} of ${originalIssues} ${originalIssues === 1 ? 'issue' : 'issues'}.`
                : 'Your PDF has been improved.'}
          </p>
          <p className="mt-0.5 text-sm text-green-700">
            {improved && (
              <span>Score improved from {originalScore}% to {remediatedScore}%. </span>
            )}
            {remainingIssues > 0 ? (
              <span>{remainingIssues} {remainingIssues === 1 ? 'item needs' : 'items need'} your review below.</span>
            ) : (
              <span>Download your improved PDF below.</span>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
