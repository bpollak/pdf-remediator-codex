'use client';

import { formatTimestamp } from '@/lib/report/time-format';
import { getReportStateSnapshot, type ReportStateTone } from '@/lib/report/report-state';
import { useAppStore } from '@/stores/app-store';

const toneClasses: Record<ReportStateTone, string> = {
  success: 'border-green-200 bg-green-50',
  attention: 'border-amber-200 bg-amber-50',
  info: 'border-blue-200 bg-blue-50',
  neutral: 'border-[rgba(24,43,73,0.15)] bg-white'
};

export function ReportStatePanel({ fileId }: { fileId: string }) {
  const file = useAppStore((state) => state.files.find((entry) => entry.id === fileId));
  const snapshot = getReportStateSnapshot(file);

  const blocks = [
    snapshot.validatedFile,
    snapshot.draftPlan,
    {
      title: 'Next required action',
      tone: snapshot.nextAction.tone,
      label: snapshot.nextAction.label,
      description: snapshot.nextAction.description,
      updatedAt: undefined,
      chips: []
    }
  ];

  return (
    <section className="space-y-3 rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
      <div>
        <h2>Current workflow state</h2>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">
          This separates the validated PDF from any saved draft plan so it is always clear what has already been verified
          and what still needs another upload.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {blocks.map((block) => (
          <article key={block.title} className={`rounded border p-3 shadow-sm ${toneClasses[block.tone]}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ucsd-text)]">{block.title}</p>
            <p className="mt-1 text-lg font-semibold text-[var(--ucsd-navy)]">{block.label}</p>
            <p className="mt-2 text-sm text-[var(--ucsd-text)]">{block.description}</p>
            {block.updatedAt ? (
              <p className="mt-2 text-xs text-[var(--ucsd-text)]">Updated: {formatTimestamp(block.updatedAt) ?? 'Unavailable'}</p>
            ) : null}
            {block.chips.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {block.chips.map((chip) => (
                  <span key={chip} className="rounded-full border border-current/15 bg-white/75 px-2 py-0.5 text-xs font-medium text-[var(--ucsd-text)]">
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
            {block.title === 'Next required action' && snapshot.nextAction.href && snapshot.nextAction.actionLabel ? (
              <a
                href={snapshot.nextAction.href}
                className="mt-3 inline-flex items-center rounded-md bg-[var(--ucsd-blue)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--ucsd-navy)]"
              >
                {snapshot.nextAction.actionLabel}
              </a>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
