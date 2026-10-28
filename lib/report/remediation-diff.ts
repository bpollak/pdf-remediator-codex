import type { AuditFinding, AuditResult, Severity } from '@/lib/audit/types';
import type { FileEntry } from '@/types/file-entry';
import { findingFixedLabel, findingPlainHowTo, findingPlainTitle, notCheckedLabel } from './finding-copy';
import { getReviewableImages, isScannedDocument } from './manual-review';

export interface FixedItem {
  ruleId: string;
  label: string;
  /** How many instances the automatic pass removed. */
  fixedCount: number;
  /** True when some instances of this problem are still left. */
  partial: boolean;
}

export interface RemainingItem {
  ruleId: string;
  title: string;
  howTo: string;
  severity: Severity;
  count: number;
  pages: number[];
  /** A representative finding, for callers that need the raw data. */
  finding: AuditFinding;
}

const severityRank: Record<Severity, number> = { critical: 3, major: 2, minor: 1 };

// Rules that describe tagging. An analysis-only result did not add usable
// tags, so these must never be reported as fixed for it.
const TAGGING_RULE_IDS = new Set(['DOC-002', 'DOC-005', 'META-002']);

function groupByRule(findings: AuditFinding[]): Map<string, AuditFinding[]> {
  const groups = new Map<string, AuditFinding[]>();
  for (const finding of findings) {
    const bucket = groups.get(finding.ruleId) ?? [];
    bucket.push(finding);
    groups.set(finding.ruleId, bucket);
  }
  return groups;
}

function worstSeverity(findings: AuditFinding[]): Severity {
  return findings.reduce<Severity>(
    (worst, finding) => (severityRank[finding.severity] > severityRank[worst] ? finding.severity : worst),
    'minor'
  );
}

/**
 * Problems found in the original upload that the automatic pass removed,
 * worked out by comparing the original audit with the audit of the updated PDF.
 */
export function summarizeAutomaticFixes(
  original: AuditResult | undefined,
  remediated: AuditResult | undefined,
  options: { analysisOnly?: boolean } = {}
): FixedItem[] {
  if (!original || !remediated) return [];
  const before = groupByRule(original.findings);
  const after = groupByRule(remediated.findings);
  const fixed: FixedItem[] = [];
  const rank = new Map<string, number>();

  for (const [ruleId, instances] of before) {
    if (options.analysisOnly && TAGGING_RULE_IDS.has(ruleId)) continue;
    const remaining = after.get(ruleId)?.length ?? 0;
    const fixedCount = instances.length - remaining;
    if (fixedCount <= 0) continue;
    rank.set(ruleId, severityRank[worstSeverity(instances)]);
    fixed.push({
      ruleId,
      label: findingFixedLabel(instances[0]),
      fixedCount,
      partial: remaining > 0
    });
  }

  return fixed.sort((a, b) => (rank.get(b.ruleId) ?? 0) - (rank.get(a.ruleId) ?? 0) || a.label.localeCompare(b.label));
}

/** Problems still present in the updated PDF, one entry per rule, worst first. */
export function summarizeRemainingIssues(remediated: AuditResult | undefined): RemainingItem[] {
  if (!remediated) return [];
  const items: RemainingItem[] = [];
  for (const [ruleId, instances] of groupByRule(remediated.findings)) {
    const pages = [...new Set(instances.map((f) => f.location.page).filter((p): p is number => typeof p === 'number'))].sort(
      (a, b) => a - b
    );
    items.push({
      ruleId,
      title: findingPlainTitle(instances[0]),
      howTo: findingPlainHowTo(instances[0]),
      severity: worstSeverity(instances),
      count: instances.length,
      pages,
      finding: instances[0]
    });
  }
  return items.sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || a.title.localeCompare(b.title));
}

/** Plain names for checks that could not run on the updated PDF, without duplicates. */
export function summarizeNotChecked(remediated: AuditResult | undefined): string[] {
  return [...new Set((remediated?.notChecked ?? []).map(notCheckedLabel))];
}

export function summarizeFileChanges(file: FileEntry | undefined) {
  // In a scan whose only images are the scanned pages, "describe each image"
  // really means "the page is a picture of text", which the OCR item covers.
  const pageScanOnly =
    isScannedDocument(file) &&
    getReviewableImages(file, file?.remediatedParsedData ?? file?.parsedData).length === 0;
  const remaining = summarizeRemainingIssues(file?.postRemediationAudit).filter(
    (item) => !(pageScanOnly && item.finding.category === 'Images & Non-Text Content')
  );
  return {
    fixed: summarizeAutomaticFixes(file?.auditResult, file?.postRemediationAudit, {
      analysisOnly: file?.remediationMode === 'analysis-only'
    }),
    remaining,
    notChecked: summarizeNotChecked(file?.postRemediationAudit)
  };
}
