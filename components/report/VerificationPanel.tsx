'use client';

import { useAppStore } from '@/stores/app-store';
import type { RemediationStopReason } from '@/lib/remediate/loop';

function metricValue(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : 'n/a';
}

function stopReasonLabel(reason: RemediationStopReason | undefined): string | null {
  if (!reason) return null;
  if (reason === 'compliant') return 'Stopped: external verification reported no failed rules.';
  if (reason === 'service_unavailable') return 'Stopped: external verification unavailable.';
  if (reason === 'no_change') return 'Stopped: additional pass produced identical output.';
  if (reason === 'no_improvement') return 'Stopped: no improvement in failed veraPDF checks.';
  if (reason === 'max_iterations') return 'Stopped: reached max remediation iterations.';
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
    return 'veraPDF returned detailed check counts but did not return a verdict label.';
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
        <h2 className="text-base font-semibold text-[var(--ucsd-navy)]">External PDF/UA check (veraPDF)</h2>
        <p className="mt-2 text-sm text-[var(--ucsd-blue)]">
          veraPDF is an independent, open-source checker for PDF/UA technical compliance.
        </p>
        <p className="mt-2 text-sm text-[var(--ucsd-blue)]">Verification result not available yet.</p>
      </section>
    );
  }

  return (
    <section className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-[var(--ucsd-navy)]">External PDF/UA check (veraPDF)</h2>

      <p className="mt-2 text-sm text-[var(--ucsd-blue)]">
        veraPDF is an independent, open-source checker for PDF/UA technical compliance.
      </p>
      <p className="mt-1 text-sm text-[var(--ucsd-blue)]">
        This external check can differ from the internal score because it uses a different ruleset.
      </p>

      <p className="mt-2 text-sm text-[var(--ucsd-blue)]">
        Profile: {verification.profile ?? 'not reported'}
      </p>

      {iterations.length > 0 ? (
        <p className="mt-2 text-sm text-[var(--ucsd-blue)]">
          Remediation passes: {iterations.length}
        </p>
      ) : null}

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
      {verification.summary ? (
        <p className="mt-2 text-sm text-[var(--ucsd-blue)]">
          Start with failed rules first, then resolve remaining failed checks.
        </p>
      ) : null}

      {statement ? (
        <p className="mt-3 text-sm text-[var(--ucsd-blue)]">{statement}</p>
      ) : null}

      {reason ? (
        <p className="mt-3 text-sm text-[var(--ucsd-blue)]">{reason}</p>
      ) : null}

      {stopReasonMessage ? (
        <p className="mt-2 text-sm text-[var(--ucsd-blue)]">{stopReasonMessage}</p>
      ) : null}
    </section>
  );
}
