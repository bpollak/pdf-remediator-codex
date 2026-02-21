'use client';

import { buildManualNextSteps } from '@/lib/report/next-steps';
import { useAppStore } from '@/stores/app-store';

const badgeClass: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-orange-100 text-orange-700',
  low: 'bg-blue-100 text-blue-700'
};

export function NextStepsPanel({ fileId }: { fileId: string }) {
  const file = useAppStore((s) => s.files.find((entry) => entry.id === fileId));
  const remediatedFindings = file?.postRemediationAudit?.findings ?? [];
  const steps = buildManualNextSteps({
    remediatedFindings,
    verapdfResult: file?.verapdfResult,
    remediationStopReason: file?.remediationStopReason
  });

  return (
    <section className="space-y-3 rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
      <div>
        <h3 className="text-base font-semibold text-[var(--ucsd-navy)]">What To Do Next</h3>
        <p className="mt-1 text-sm text-[var(--ucsd-blue)]">
          Internal score reflects this app&apos;s ruleset. PDF/UA status comes from external veraPDF verification.
        </p>
      </div>

      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li key={`${step.title}-${index}`} className="rounded border border-[rgba(24,43,73,0.15)] p-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[var(--ucsd-navy)]">
                {index + 1}. {step.title}
              </span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass[step.severity]}`}>
                {step.severity}
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--ucsd-blue)]">{step.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
