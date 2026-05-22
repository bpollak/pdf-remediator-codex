'use client';

import { getReportStateSnapshot, type ReportStateTone } from '@/lib/report/report-state';
import { summarizeManualCompletion } from '@/lib/report/manual-review';
import { formatTimestamp } from '@/lib/report/time-format';
import { useAppStore } from '@/stores/app-store';

const toneClasses: Record<ReportStateTone, string> = {
  success: 'border-green-300 bg-green-50',
  attention: 'border-amber-300 bg-amber-50',
  info: 'border-[rgba(0,98,155,0.35)] bg-[rgba(0,98,155,0.06)]',
  neutral: 'border-[rgba(24,43,73,0.18)] bg-white'
};

function statusLabel(done: boolean, unavailable = false) {
  if (unavailable) return 'Not needed';
  return done ? 'Done' : 'Next';
}

export function ResultsOverview({ fileId }: { fileId: string }) {
  const file = useAppStore((state) => state.files.find((entry) => entry.id === fileId));
  const snapshot = getReportStateSnapshot(file);
  const completion = summarizeManualCompletion(file);
  const remaining = Math.max(completion.total - completion.completed, 0);
  const downloadedAtLabel = formatTimestamp(file?.workflowProgress?.downloadedAt);
  const hasManualItems = completion.total > 0;

  return (
    <section className={`rounded-lg border-2 p-5 shadow-sm ${toneClasses[snapshot.nextAction.tone]}`}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ucsd-text)]">Do this next</p>
          <h2 className="mt-1 text-2xl font-semibold leading-tight text-[var(--ucsd-navy)]">
            {snapshot.nextAction.label}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--ucsd-text)]">
            {snapshot.nextAction.description}
          </p>
          {snapshot.nextAction.href && snapshot.nextAction.actionLabel ? (
            <a
              href={snapshot.nextAction.href}
              className="mt-4 inline-flex items-center rounded-md bg-[var(--ucsd-blue)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--ucsd-navy)]"
            >
              {snapshot.nextAction.actionLabel}
            </a>
          ) : null}
        </div>

        <div className="rounded-md border border-[rgba(24,43,73,0.14)] bg-white/80 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--ucsd-navy)]">Manual progress</p>
            <p className="text-3xl font-semibold text-[var(--ucsd-navy)]">{completion.percent}%</p>
          </div>
          <div
            className="mt-3 h-2 rounded-full bg-slate-100"
            role="progressbar"
            aria-label="Manual remediation completion"
            aria-valuenow={completion.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-2 rounded-full bg-[var(--ucsd-blue)]" style={{ width: `${completion.percent}%` }} />
          </div>
          <p className="mt-3 text-sm text-[var(--ucsd-text)]">
            {hasManualItems
              ? `${completion.completed} of ${completion.total} tracked manual items complete${remaining > 0 ? `; ${remaining} remaining` : ''}.`
              : 'No manual fixes are currently tracked for this file.'}
          </p>
        </div>
      </div>

      <ol className="mt-5 grid gap-3 md:grid-cols-3" aria-label="Simplified results path">
        <li className="rounded-md border border-[rgba(24,43,73,0.14)] bg-white/75 p-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-[var(--ucsd-navy)]">1. Download</h3>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-[var(--ucsd-text)]">
              {statusLabel(Boolean(downloadedAtLabel), !file?.remediatedBytes)}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--ucsd-text)]">
            {downloadedAtLabel ? `Saved ${downloadedAtLabel}.` : 'Save the improved PDF before manual review.'}
          </p>
        </li>
        <li className="rounded-md border border-[rgba(24,43,73,0.14)] bg-white/75 p-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-[var(--ucsd-navy)]">2. Fix remaining items</h3>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-[var(--ucsd-text)]">
              {statusLabel(remaining === 0, !hasManualItems)}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--ucsd-text)]">
            Use Acrobat, PAC, or the source file for any items the app cannot safely apply.
          </p>
        </li>
        <li className="rounded-md border border-[rgba(24,43,73,0.14)] bg-white/75 p-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-[var(--ucsd-navy)]">3. Validate</h3>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-[var(--ucsd-text)]">
              {snapshot.validatedFile.tone === 'success' ? 'Passed' : 'Required'}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--ucsd-text)]">
            Re-upload the final revised PDF when manual fixes are applied.
          </p>
        </li>
      </ol>
    </section>
  );
}
