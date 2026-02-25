'use client';

import type { AuditResult } from '@/lib/audit/types';
import type { ParsedPDF } from '@/lib/pdf/types';
import { useAppStore } from '@/stores/app-store';

function yesNo(value: boolean | undefined): string {
  return value ? 'Yes' : 'No';
}

function metricTone(value: boolean | undefined, preferTrue = true): string {
  if (value === undefined) return 'text-gray-500';
  const ok = preferTrue ? value : !value;
  return ok ? 'text-green-700' : 'text-red-700';
}

function hasDoc005(audit?: AuditResult): boolean {
  return Boolean(audit?.findings.some((finding) => finding.ruleId === 'DOC-005'));
}

function sourceTypeLabel(sourceType: string | undefined): string {
  if (sourceType === 'content-document') return 'Content document';
  if (sourceType === 'checker-report-artifact') return 'Checker/report artifact';
  if (sourceType === 'mixed-or-uncertain') return 'Mixed or uncertain';
  return 'Not classified';
}

function SnapshotCard({
  title,
  parsed,
  audit,
  remediationMode
}: {
  title: string;
  parsed?: ParsedPDF;
  audit?: AuditResult;
  remediationMode?: string;
}) {
  const binding = parsed?.structureBinding;
  const doc005 = hasDoc005(audit);

  return (
    <article className="rounded border border-[rgba(24,43,73,0.15)] bg-slate-50 p-3">
      <h4 className="text-sm font-semibold text-[var(--ucsd-navy)]">{title}</h4>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-sm text-[var(--ucsd-text)]">
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">StructTreeRoot</dt>
          <dd className={metricTone(parsed?.hasStructTree, true)}>{yesNo(parsed?.hasStructTree)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Content binding</dt>
          <dd className={metricTone(binding?.hasContentBinding, true)}>{yesNo(binding?.hasContentBinding)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">ParentTree entries</dt>
          <dd className={metricTone(binding?.hasParentTreeEntries, true)}>{yesNo(binding?.hasParentTreeEntries)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">DOC-005 raised</dt>
          <dd className={metricTone(doc005, false)}>{yesNo(doc005)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Struct elements</dt>
          <dd>{binding?.structElemCount ?? 'n/a'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Table struct nodes</dt>
          <dd>{binding?.tableStructCount ?? 'n/a'}</dd>
        </div>
      </dl>
      {remediationMode ? (
        <p className="mt-2 text-xs text-[var(--ucsd-text)]">
          Remediation mode: <span className="font-medium">{remediationMode}</span>
        </p>
      ) : null}
    </article>
  );
}

export function StructuralIntegrityPanel({ fileId }: { fileId: string }) {
  const file = useAppStore((state) => state.files.find((entry) => entry.id === fileId));
  const sourceTypeIsArtifact = file?.sourceType === 'checker-report-artifact';

  return (
    <section className="space-y-3 rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
      <div>
        <h2>Structural Integrity</h2>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">
          Trust signals for tag-tree quality, content bindings, and source-file suitability.
        </p>
      </div>

      <article className="rounded border border-[rgba(24,43,73,0.15)] bg-slate-50 p-3">
        <h4 className="text-sm font-semibold text-[var(--ucsd-navy)]">Source type assessment</h4>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">
          {sourceTypeLabel(file?.sourceType)} ({file?.sourceTypeConfidence ?? 'n/a'} confidence)
        </p>
        {file?.sourceTypeReasons?.length ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ucsd-text)]">
            {file.sourceTypeReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
        {file?.sourceTypeSuggestedAction ? (
          <p className="mt-2 text-xs text-[var(--ucsd-text)]">Recommended action: {file.sourceTypeSuggestedAction}</p>
        ) : null}
      </article>

      {sourceTypeIsArtifact ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This file looks like a checker report artifact. Treat remediation output as QA support, not publishing output.
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <SnapshotCard title="Original snapshot" parsed={file?.parsedData} audit={file?.auditResult} />
        <SnapshotCard
          title="Remediated snapshot"
          parsed={file?.remediatedParsedData}
          audit={file?.postRemediationAudit}
          remediationMode={file?.remediationMode}
        />
      </div>
    </section>
  );
}
