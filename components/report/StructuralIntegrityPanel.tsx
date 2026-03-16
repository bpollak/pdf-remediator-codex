'use client';

import { useState } from 'react';
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

function structureHealthSummary(parsed?: ParsedPDF, audit?: AuditResult): { label: string; tone: string } {
  if (!parsed) return { label: 'No structure data available', tone: 'text-gray-500' };
  const hasTree = parsed.hasStructTree;
  const hasBinding = parsed.structureBinding?.hasContentBinding;
  const hasParent = parsed.structureBinding?.hasParentTreeEntries;
  const doc005 = hasDoc005(audit);

  if (hasTree && hasBinding && hasParent && !doc005) {
    return { label: 'Reading structure looks good', tone: 'text-green-700' };
  }
  if (hasTree && (hasBinding || hasParent)) {
    return { label: 'Partial reading structure — some manual fixes may be needed', tone: 'text-amber-700' };
  }
  if (hasTree) {
    return { label: 'Basic structure present but missing connections to content', tone: 'text-amber-700' };
  }
  return { label: 'No reading structure found — manual work needed for screen readers', tone: 'text-red-700' };
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
          <dt className="text-xs uppercase tracking-wide text-gray-500">Reading structure</dt>
          <dd className={metricTone(parsed?.hasStructTree, true)}>{yesNo(parsed?.hasStructTree)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Content connections</dt>
          <dd className={metricTone(binding?.hasParentTreeEntries, true)}>{yesNo(binding?.hasParentTreeEntries)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Content linked</dt>
          <dd className={metricTone(binding?.hasContentBinding, true)}>{yesNo(binding?.hasContentBinding)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Disconnected elements</dt>
          <dd className={metricTone(doc005, false)}>{yesNo(doc005)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Structured elements</dt>
          <dd>{binding?.structElemCount ?? 'n/a'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Tagged tables</dt>
          <dd>{binding?.tableStructCount ?? 'n/a'}</dd>
        </div>
      </dl>
      {remediationMode ? (
        <p className="mt-2 text-xs text-[var(--ucsd-text)]">
          Fix mode: <span className="font-medium">{remediationMode === 'analysis-only' ? 'Analysis only (manual fixes needed)' : remediationMode}</span>
        </p>
      ) : null}
    </article>
  );
}

export function StructuralIntegrityPanel({ fileId }: { fileId: string }) {
  const file = useAppStore((state) => state.files.find((entry) => entry.id === fileId));
  const sourceTypeIsArtifact = file?.sourceType === 'checker-report-artifact';
  const [showDetails, setShowDetails] = useState(false);

  const originalHealth = structureHealthSummary(file?.parsedData, file?.auditResult);
  const remediatedHealth = structureHealthSummary(file?.remediatedParsedData, file?.postRemediationAudit);

  return (
    <section className="space-y-3 rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm">
      <div>
        <h2>Document Health</h2>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">
          How well your PDF is set up for screen readers and assistive tools.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded border border-[rgba(24,43,73,0.15)] bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">Original</p>
          <p className={`mt-1 text-sm font-medium ${originalHealth.tone}`}>{originalHealth.label}</p>
        </div>
        <div className="rounded border border-[rgba(24,43,73,0.15)] bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">After auto-fix</p>
          <p className={`mt-1 text-sm font-medium ${remediatedHealth.tone}`}>{remediatedHealth.label}</p>
        </div>
      </div>

      {file?.sourceType && file.sourceType !== 'content-document' ? (
        <article className="rounded border border-[rgba(24,43,73,0.15)] bg-slate-50 p-3">
          <p className="text-sm font-medium text-[var(--ucsd-navy)]">Document type: {sourceTypeLabel(file.sourceType)}</p>
          {file.sourceTypeSuggestedAction ? (
            <p className="mt-1 text-sm text-[var(--ucsd-text)]">{file.sourceTypeSuggestedAction}</p>
          ) : null}
        </article>
      ) : null}

      {sourceTypeIsArtifact ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This file appears to be a report or checker output, not a document you would publish.
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--ucsd-blue)] hover:text-[var(--ucsd-navy)]"
        aria-expanded={showDetails}
      >
        <span className={`inline-block transition-transform ${showDetails ? 'rotate-90' : ''}`}>&#9654;</span>
        {showDetails ? 'Hide technical details' : 'Show technical details'}
      </button>

      {showDetails ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <SnapshotCard title="Original snapshot" parsed={file?.parsedData} audit={file?.auditResult} />
          <SnapshotCard
            title="Improved snapshot"
            parsed={file?.remediatedParsedData}
            audit={file?.postRemediationAudit}
            remediationMode={file?.remediationMode}
          />
        </div>
      ) : null}
    </section>
  );
}
