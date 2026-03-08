'use client';

import { useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { IssueCard } from './IssueCard';
import { findingActionTitle } from '@/lib/report/finding-copy';
import type { AuditFinding, Category, Severity } from '@/lib/audit/types';

type AuditVariant = 'original' | 'remediated';

interface IssueListProps {
  fileId: string;
  variant?: AuditVariant;
}

/** Rank severity so categories with critical findings sort first. */
function worstSeverityRank(findings: AuditFinding[]): number {
  let worst = 0;
  for (const f of findings) {
    if (f.severity === 'critical') return 3;
    if (f.severity === 'major' && worst < 2) worst = 2;
    if (f.severity === 'minor' && worst < 1) worst = 1;
  }
  return worst;
}

function worstSeverity(findings: AuditFinding[]): Severity {
  for (const f of findings) {
    if (f.severity === 'critical') return 'critical';
  }
  for (const f of findings) {
    if (f.severity === 'major') return 'major';
  }
  return 'minor';
}

const severityStyles = {
  critical: 'bg-red-100 text-red-800',
  major: 'bg-orange-100 text-orange-800',
  minor: 'bg-gray-100 text-gray-600',
} as const;

const severityLabel = {
  critical: 'High priority',
  major: 'Medium priority',
  minor: 'Lower priority',
} as const;

/** Sub-group findings within a category by ruleId. */
function groupByRule(findings: AuditFinding[]): { ruleId: string; instances: AuditFinding[] }[] {
  const map = new Map<string, AuditFinding[]>();
  for (const f of findings) {
    const bucket = map.get(f.ruleId) ?? [];
    bucket.push(f);
    map.set(f.ruleId, bucket);
  }
  return [...map.entries()].map(([ruleId, instances]) => ({ ruleId, instances }));
}

function formatPageList(findings: AuditFinding[]): string {
  const pages = findings
    .map((f) => f.location.page)
    .filter((p): p is number => typeof p === 'number')
    .sort((a, b) => a - b);
  if (pages.length === 0) return '';
  const unique = [...new Set(pages)];
  if (unique.length === 1) return `Page ${unique[0]}`;
  return `Pages ${unique.join(', ')}`;
}

function GroupedIssueCard({
  instances,
  fileId,
  variant,
}: {
  instances: AuditFinding[];
  fileId: string;
  variant: AuditVariant;
}) {
  const [expanded, setExpanded] = useState(false);
  const representative = instances[0];
  const severity = worstSeverity(instances);
  const pageList = formatPageList(instances);

  return (
    <div className="space-y-2">
      <article className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-3 shadow-sm">
        <p className="font-medium text-[var(--ucsd-navy)]">
          {findingActionTitle(representative)}
        </p>
        <p className="mt-1 text-[var(--ucsd-text)]">
          <span className="font-medium">What we found:</span> {representative.description}
        </p>
        {representative.recommendation && (
          <p className="mt-1 text-sm text-gray-600">
            <span className="font-medium">How to fix:</span> {representative.recommendation}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {pageList && <span className="text-[var(--ucsd-blue)]">{pageList}</span>}
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${severityStyles[severity]}`}>
            {severityLabel[severity]}
          </span>
          {representative.autoFixable && (
            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
              Can be auto-fixed
            </span>
          )}
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {instances.length} {instances.length === 1 ? 'instance' : 'instances'}
          </span>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Technical reference: {representative.ruleId} • WCAG {representative.wcagCriterion}
        </p>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 rounded-md border border-[rgba(24,43,73,0.25)] px-3 py-1.5 text-xs font-medium text-[var(--ucsd-text)] hover:bg-slate-50"
          aria-expanded={expanded}
        >
          <span className={`inline-block transition-transform ${expanded ? 'rotate-90' : ''}`}>&#9654;</span>
          {expanded ? `Hide ${instances.length} individual findings` : `Show ${instances.length} individual findings`}
        </button>
      </article>
      {expanded && (
        <div className="space-y-2 pl-4 border-l-2 border-[rgba(24,43,73,0.1)]">
          {instances.map((finding, index) => (
            <IssueCard key={`${finding.ruleId}-${finding.location.page ?? index}`} finding={finding} fileId={fileId} variant={variant} />
          ))}
        </div>
      )}
    </div>
  );
}

export function IssueList({ fileId, variant = 'original' }: IssueListProps) {
  const auditResult = useAppStore((s) => {
    const file = s.files.find((f) => f.id === fileId);
    return variant === 'remediated' ? file?.postRemediationAudit : file?.auditResult;
  });

  if (!auditResult) {
    return (
      <section className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 text-sm text-[var(--ucsd-text)] shadow-sm">
        {variant === 'remediated' ? 'No remediated audit result yet.' : 'No audit result yet.'}
      </section>
    );
  }

  if (!auditResult.findings.length) {
    return (
      <section className="rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 text-sm text-[var(--ucsd-text)] shadow-sm">
        No issues identified.
      </section>
    );
  }

  // Group findings by category
  const grouped = new Map<Category, AuditFinding[]>();
  for (const finding of auditResult.findings) {
    const bucket = grouped.get(finding.category) ?? [];
    bucket.push(finding);
    grouped.set(finding.category, bucket);
  }

  // Sort categories: worst severity first, then alphabetically
  const sortedCategories = [...grouped.entries()].sort(
    (a, b) => worstSeverityRank(b[1]) - worstSeverityRank(a[1]) || a[0].localeCompare(b[0])
  );

  return (
    <section className="space-y-6">
      {sortedCategories.map(([category, findings]) => {
        const ruleGroups = groupByRule(findings);
        return (
          <div key={category}>
            <h4 className="mb-2 flex items-baseline gap-2">
              {category}
              <span className="text-xs font-normal text-gray-400">
                {findings.length} {findings.length === 1 ? 'issue' : 'issues'}
              </span>
            </h4>
            <div className="space-y-2">
              {ruleGroups.map((group) =>
                group.instances.length === 1 ? (
                  <IssueCard
                    key={group.ruleId}
                    finding={group.instances[0]}
                    fileId={fileId}
                    variant={variant}
                  />
                ) : (
                  <GroupedIssueCard
                    key={group.ruleId}
                    ruleId={group.ruleId}
                    instances={group.instances}
                    fileId={fileId}
                    variant={variant}
                  />
                )
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
