'use client';

import { useAppStore } from '@/stores/app-store';
import type { RemediationStopReason } from '@/lib/remediate/loop';

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

  if (!verification) {
    return (
      <section className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
        <h2>PDF/UA verification (veraPDF)</h2>
        <p className="mt-2 text-sm text-[var(--ucsd-text)]">
          veraPDF is an open-source tool that checks whether a PDF meets PDF/UA accessibility requirements.
        </p>
        <p className="mt-2 text-sm text-[var(--ucsd-text)]">Verification result is not available yet.</p>
      </section>
    );
  }

  return (
    <section className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
      <h2>PDF/UA verification (veraPDF)</h2>

      <p className="mt-2 text-sm text-[var(--ucsd-text)]">
        veraPDF is an open-source tool that checks whether a PDF meets PDF/UA accessibility requirements.
      </p>

      <p className="mt-2 text-sm text-[var(--ucsd-text)]">
        Standard checked: {verification.profile ?? 'not reported'}
      </p>

      {iterations.length > 0 ? (
        <p className="mt-2 text-sm text-[var(--ucsd-text)]">
          Automatic fix attempts: {iterations.length}
        </p>
      ) : null}

      {verification.summary ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm text-[var(--ucsd-text)] md:grid-cols-4">
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
      {verification.summary ? (
        <p className="mt-2 text-sm text-[var(--ucsd-text)]">
          Next step: fix failed rules first, then fix remaining failed checks.
        </p>
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
