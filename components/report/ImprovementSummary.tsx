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

  if (fixedIssues <= 0 && !improved) return null;

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
