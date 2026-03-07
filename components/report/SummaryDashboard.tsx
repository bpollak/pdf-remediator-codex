'use client';

import { useAppStore } from '@/stores/app-store';
import { ComplianceScore } from './ComplianceScore';
import { ALL_CATEGORIES, type Category } from '@/lib/audit/types';
import { computeDisplayedAutomatedScore } from '@/lib/report/display-score';
import { getAccessibilityStatus } from '@/lib/report/accessibility-status';
import { summarizeManualReviewState } from '@/lib/report/manual-review';
import { formatTimestamp } from '@/lib/report/time-format';

type AuditVariant = 'original' | 'remediated';

interface SummaryDashboardProps {
  fileId: string;
  variant?: AuditVariant;
}

const severityBadge = {
  critical: 'bg-red-100 text-red-800',
  major: 'bg-orange-100 text-orange-800',
  minor: 'bg-gray-100 text-gray-600',
} as const;

export function SummaryDashboard({ fileId, variant = 'original' }: SummaryDashboardProps) {
  const file = useAppStore((s) => s.files.find((f) => f.id === fileId));
  const auditResult = variant === 'remediated' ? file?.postRemediationAudit : file?.auditResult;
  const verapdfResult = file?.verapdfResult;
  const accessibilityStatus = getAccessibilityStatus(file);
  const manualReview = summarizeManualReviewState(file);
  const remediatedGeneratedAt = formatTimestamp(file?.remediationCompletedAt);
  const draftUpdatedAt = formatTimestamp(manualReview.updatedAt);

  if (!auditResult) {
    return (
      <section className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
        <p className="text-sm text-[var(--ucsd-text)]">
          {variant === 'remediated' ? 'No remediated audit result yet.' : 'No audit result yet.'}
        </p>
      </section>
    );
  }

  const { findings } = auditResult;
  const displayedScore = computeDisplayedAutomatedScore({
    auditResult,
    variant,
    verapdfResult
  });

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const majorCount = findings.filter((f) => f.severity === 'major').length;
  const minorCount = findings.filter((f) => f.severity === 'minor').length;

  const findingsByCategory = new Map<Category, number>();
  for (const f of findings) {
    findingsByCategory.set(f.category, (findingsByCategory.get(f.category) ?? 0) + 1);
  }

  const scoreTitle =
    variant === 'remediated'
      ? 'Automated baseline for current remediated PDF'
      : 'Automated baseline for uploaded PDF';
  const scoreDescription =
    variant === 'remediated'
      ? 'Manual draft edits in the workspaces below do not change this baseline until you validate a revised PDF.'
      : 'This baseline reflects the uploaded file before final manual remediation.';

  return (
    <section className="space-y-4 rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
      <ComplianceScore
        score={displayedScore ?? auditResult.score}
        title={scoreTitle}
        description={scoreDescription}
      />
      {variant === 'remediated' ? (
        <div className="rounded border border-[rgba(24,43,73,0.12)] bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ucsd-text)]">Accessibility decision</p>
          <p className="mt-1 text-lg font-semibold text-[var(--ucsd-navy)]">{accessibilityStatus.label}</p>
          <p className="mt-1 text-sm text-[var(--ucsd-text)]">{accessibilityStatus.message}</p>
        </div>
      ) : null}
      {variant === 'remediated' && (
        <p className="text-sm text-[var(--ucsd-text)]">
          Use this automated baseline as a progress signal. The final publish decision comes from the accessibility status and the PDF/UA validation result.
        </p>
      )}
      {variant === 'remediated' && manualReview.pendingRevalidation ? (
        <p className="text-sm text-[var(--ucsd-text)]">
          Manual draft edits exist in the workspaces below. Re-upload or validate a revised PDF before treating the current file as publish-ready.
        </p>
      ) : null}
      {variant === 'remediated' && (remediatedGeneratedAt || draftUpdatedAt) ? (
        <div className="rounded border border-[rgba(24,43,73,0.12)] bg-slate-50 p-3 text-sm text-[var(--ucsd-text)]">
          {remediatedGeneratedAt ? <p>Current remediated PDF generated: {remediatedGeneratedAt}</p> : null}
          {draftUpdatedAt ? <p className="mt-1">Latest saved draft edit: {draftUpdatedAt}</p> : null}
        </div>
      ) : null}
      {variant === 'remediated' && displayedScore !== undefined && displayedScore < auditResult.score && (
        <p className="text-sm text-[var(--ucsd-text)]">
          A perfect automated baseline is only shown when this app&apos;s critical findings are clear and the external PDF/UA check passes.
        </p>
      )}
      {variant === 'remediated' && file?.remediationMode === 'analysis-only' && (
        <p className="text-sm text-[var(--ucsd-text)]">
          Structural remediation mode is analysis-only for this file. Content-bound tagging was not guaranteed and still needs manual work in Acrobat or PAC.
        </p>
      )}
      {variant === 'remediated' && file?.sourceType === 'checker-report-artifact' && (
        <p className="text-sm text-[var(--ucsd-text)]">
          Source assessment indicates this is likely a checker or report PDF, not a source content document.
        </p>
      )}
      {variant === 'remediated' && verapdfResult?.compliant === false && (
        <p className="text-sm text-[var(--ucsd-text)]">
          Internal fixes improved this file, but the external PDF/UA check still found issues to resolve manually.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {criticalCount > 0 && (
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${severityBadge.critical}`}>
            {criticalCount} critical
          </span>
        )}
        {majorCount > 0 && (
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${severityBadge.major}`}>
            {majorCount} major
          </span>
        )}
        {minorCount > 0 && (
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${severityBadge.minor}`}>
            {minorCount} minor
          </span>
        )}
        {findings.length === 0 && (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
            No issues found
          </span>
        )}
      </div>

      {/* Category checklist */}
      <ul className="grid gap-1 text-sm">
        {ALL_CATEGORIES.map((category) => {
          const count = findingsByCategory.get(category) ?? 0;
          const passed = count === 0;
          return (
            <li key={category} className="flex items-center gap-2">
              {passed ? (
                <svg className="h-4 w-4 shrink-0 text-green-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="h-4 w-4 shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd" />
                </svg>
              )}
              <span className={passed ? 'text-gray-500' : 'text-[var(--ucsd-navy)]'}>
                {category}
              </span>
              {count > 0 && (
                <span className="ml-auto text-xs text-gray-400">
                  {count} {count === 1 ? 'issue' : 'issues'}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
