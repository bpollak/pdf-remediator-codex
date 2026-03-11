'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/stores/app-store';
import { buildWorkflowSteps, type WorkflowStepState } from '@/lib/report/workflow-steps';

const stateLabel: Record<WorkflowStepState, string> = {
  complete: 'Complete',
  current: 'Current step',
  pending: 'Pending',
  'not-needed': 'Not needed'
};

const stateClasses: Record<WorkflowStepState, string> = {
  complete: 'border-green-200 bg-green-50',
  current: 'border-[var(--ucsd-blue)] bg-[rgba(0,98,155,0.06)] ring-2 ring-[rgba(0,98,155,0.15)]',
  pending: 'border-[rgba(24,43,73,0.15)] bg-white',
  'not-needed': 'border-slate-200 bg-slate-50'
};

export function WorkflowStepper({ fileId }: { fileId: string }) {
  const file = useAppStore((state) => state.files.find((entry) => entry.id === fileId));

  const steps = useMemo(() => buildWorkflowSteps(file), [file]);

  return (
    <section className="space-y-3 rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
      <div>
        <h2>Remediation workflow</h2>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">
          Follow the recommended order below, but you can open any step at any time. Each card reflects what you have actually done in this workflow, not just what the app has generated.
        </p>
      </div>

      <ol className="grid gap-3 lg:grid-cols-2" aria-label="Accessibility remediation workflow">
        {steps.map((step, index) => (
          <li
            key={step.key}
            aria-current={step.state === 'current' ? 'step' : undefined}
            className={`rounded border p-3 shadow-sm ${stateClasses[step.state]}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ucsd-text)]">
                  Step {index + 1}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-[var(--ucsd-navy)]">{step.title}</h3>
              </div>
              <span className="rounded-full border border-current/15 bg-white/80 px-2 py-0.5 text-xs font-medium text-[var(--ucsd-text)]">
                {stateLabel[step.state]}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--ucsd-text)]">{step.description}</p>
            <a
              href={step.href}
              className="mt-3 inline-flex items-center rounded-md bg-[var(--ucsd-blue)] px-3 py-2 text-sm font-medium text-white transition hover:bg-[var(--ucsd-navy)]"
            >
              {step.actionLabel}
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
