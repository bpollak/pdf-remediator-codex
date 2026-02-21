'use client';

import { useAppStore } from '@/stores/app-store';

function metricValue(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : 'n/a';
}

export function VerificationPanel({ fileId }: { fileId: string }) {
  const verification = useAppStore((s) => s.files.find((f) => f.id === fileId)?.verapdfResult);

  if (!verification) {
    return (
      <section className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
        <h3 className="text-base font-semibold text-[var(--ucsd-navy)]">veraPDF verification</h3>
        <p className="mt-2 text-sm text-[var(--ucsd-blue)]">Verification result not available yet.</p>
      </section>
    );
  }

  const verdictLabel = verification.compliant === true
    ? 'Compliant'
    : verification.compliant === false
      ? 'Not compliant'
      : verification.attempted === false
        ? 'Not enabled'
        : 'No verdict';

  const verdictClassName = verification.compliant === true
    ? 'bg-green-100 text-green-700'
    : verification.compliant === false
      ? 'bg-red-100 text-red-700'
      : 'bg-gray-100 text-gray-700';

  return (
    <section className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-[var(--ucsd-navy)]">veraPDF verification</h3>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${verdictClassName}`}>
          {verdictLabel}
        </span>
      </div>

      <p className="mt-2 text-sm text-[var(--ucsd-blue)]">
        Profile: {verification.profile ?? 'not reported'}
      </p>

      {verification.summary ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm text-[var(--ucsd-blue)] md:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Passed rules</dt>
            <dd>{metricValue(verification.summary.passedRules)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Failed rules</dt>
            <dd>{metricValue(verification.summary.failedRules)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Passed checks</dt>
            <dd>{metricValue(verification.summary.passedChecks)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Failed checks</dt>
            <dd>{metricValue(verification.summary.failedChecks)}</dd>
          </div>
        </dl>
      ) : null}

      {verification.statement ? (
        <p className="mt-3 text-sm text-[var(--ucsd-blue)]">{verification.statement}</p>
      ) : null}

      {verification.reason ? (
        <p className="mt-3 text-sm text-[var(--ucsd-blue)]">{verification.reason}</p>
      ) : null}
    </section>
  );
}
