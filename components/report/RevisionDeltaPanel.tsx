'use client';

import { getRevisionDeltaSummary, type RevisionTrend } from '@/lib/report/revision-delta';
import { formatTimestamp } from '@/lib/report/time-format';
import { useAppStore } from '@/stores/app-store';

const trendClasses: Record<RevisionTrend, string> = {
  improved: 'border-green-200 bg-green-50 text-green-900',
  regressed: 'border-red-200 bg-red-50 text-red-900',
  unchanged: 'border-[rgba(24,43,73,0.15)] bg-white text-[var(--ucsd-text)]'
};

const trendLabel: Record<RevisionTrend, string> = {
  improved: 'Improved',
  regressed: 'Regressed',
  unchanged: 'Unchanged'
};

export function RevisionDeltaPanel({ fileId }: { fileId: string }) {
  const files = useAppStore((state) => state.files);
  const file = files.find((entry) => entry.id === fileId);
  const summary = getRevisionDeltaSummary(file, files);

  if (!summary) return null;

  if (!summary.parent) {
    return (
      <section className="space-y-3 rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
        <div>
          <h2>Revision history</h2>
          <p className="mt-1 text-sm text-[var(--ucsd-text)]">
            This review already has linked revised upload{summary.descendants.length === 1 ? '' : 's'}.
          </p>
        </div>
        <div className="rounded border border-[rgba(24,43,73,0.15)] bg-slate-50 p-3 text-sm text-[var(--ucsd-text)]">
          <p>
            Linked revised uploads: {summary.descendants.length}
          </p>
          {summary.latestDescendant ? (
            <>
              <p className="mt-1">Latest revised upload: {summary.latestDescendant.name}</p>
              <p className="mt-1">
                Latest validation update: {formatTimestamp(summary.latestDescendant.validationCompletedAt ?? summary.latestDescendant.remediationCompletedAt) ?? 'Unavailable'}
              </p>
              <a
                href={`/app/${summary.latestDescendant.id}/compare`}
                className="mt-3 inline-flex items-center rounded-md bg-[var(--ucsd-blue)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--ucsd-navy)]"
              >
                Open latest revised review
              </a>
            </>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
      <div>
        <h2>Revision delta</h2>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">
          This run is linked to an earlier review so you can see whether the revised PDF improved validation and reduced findings.
        </p>
      </div>

      <div className="rounded border border-[rgba(24,43,73,0.15)] bg-slate-50 p-3 text-sm text-[var(--ucsd-text)]">
        <p className="font-medium text-[var(--ucsd-navy)]">Previous review: {summary.parent.name}</p>
        <p className="mt-1">
          Previous validation update: {formatTimestamp(summary.parent.validationCompletedAt ?? summary.parent.remediationCompletedAt) ?? 'Unavailable'}
        </p>
        <a
          href={`/app/${summary.parent.id}/compare`}
          className="mt-3 inline-flex items-center rounded-md border border-[rgba(24,43,73,0.25)] px-3 py-2 text-sm font-medium text-[var(--ucsd-text)] hover:bg-white"
        >
          Open previous review
        </a>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {summary.metrics.map((metric) => (
          <article key={metric.label} className={`rounded border p-3 shadow-sm ${trendClasses[metric.trend]}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{metric.label}</p>
              <span className="rounded-full border border-current/15 bg-white/70 px-2 py-0.5 text-xs font-medium">
                {trendLabel[metric.trend]}
              </span>
            </div>
            <p className="mt-2 text-xs uppercase tracking-[0.08em] text-[var(--ucsd-text)]">Previous</p>
            <p className="text-sm">{metric.previousValue}</p>
            <p className="mt-2 text-xs uppercase tracking-[0.08em] text-[var(--ucsd-text)]">Current</p>
            <p className="text-sm font-medium">{metric.currentValue}</p>
            {metric.detail ? <p className="mt-2 text-xs text-[var(--ucsd-text)]">{metric.detail}</p> : null}
          </article>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-green-900">
          {summary.issuesCleared} findings cleared
        </span>
        <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-red-900">
          {summary.issuesIntroduced} findings introduced
        </span>
        {summary.validationChanged ? (
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-900">
            Validation verdict changed
          </span>
        ) : null}
      </div>
    </section>
  );
}
