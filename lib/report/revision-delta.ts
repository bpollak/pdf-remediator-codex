import type { FileEntry } from '@/types/file-entry';
import { getAccessibilityStatus } from './accessibility-status';
import { computeDisplayedAutomatedScore } from './display-score';
import { getVerapdfComplianceVerdict, getVerapdfUnavailableReason } from '@/lib/verapdf/result';

export type RevisionTrend = 'improved' | 'regressed' | 'unchanged';

export interface RevisionDeltaMetric {
  label: string;
  previousValue: string;
  currentValue: string;
  trend: RevisionTrend;
  detail?: string;
}

export interface RevisionDeltaSummary {
  parent?: FileEntry;
  descendants: FileEntry[];
  latestDescendant?: FileEntry;
  metrics: RevisionDeltaMetric[];
  issuesCleared: number;
  issuesIntroduced: number;
  validationChanged: boolean;
}

function compareCounts(current: number, previous: number): RevisionTrend {
  if (current < previous) return 'improved';
  if (current > previous) return 'regressed';
  return 'unchanged';
}

function compareScores(current: number | undefined, previous: number | undefined): RevisionTrend {
  if (typeof current !== 'number' || typeof previous !== 'number') return 'unchanged';
  if (current > previous) return 'improved';
  if (current < previous) return 'regressed';
  return 'unchanged';
}

function formatCount(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : 'Unavailable';
}

function statusRank(status: ReturnType<typeof getAccessibilityStatus>['status']): number {
  if (status === 'accessible') return 3;
  if (status === 'verification-unavailable') return 1;
  if (status === 'processing') return 0;
  return 1;
}

function compareStatus(
  current: ReturnType<typeof getAccessibilityStatus>,
  previous: ReturnType<typeof getAccessibilityStatus>
): RevisionTrend {
  const currentRank = statusRank(current.status);
  const previousRank = statusRank(previous.status);
  if (currentRank > previousRank) return 'improved';
  if (currentRank < previousRank) return 'regressed';
  if (current.label === previous.label) return 'unchanged';
  if (current.status === 'accessible' && previous.status !== 'accessible') return 'improved';
  if (current.status !== 'accessible' && previous.status === 'accessible') return 'regressed';
  return 'unchanged';
}

function findingsFingerprint(file: FileEntry | undefined): Set<string> {
  const findings = file?.postRemediationAudit?.findings ?? [];
  return new Set(
    findings.map((finding) =>
      [
        finding.ruleId,
        finding.category,
        finding.description,
        finding.location.page ?? '',
        finding.location.element ?? ''
      ].join('|')
    )
  );
}

function latestByTimestamp(files: FileEntry[]): FileEntry | undefined {
  return files
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a.validationCompletedAt ?? a.remediationCompletedAt ?? 0).getTime();
      const bTime = new Date(b.validationCompletedAt ?? b.remediationCompletedAt ?? 0).getTime();
      return bTime - aTime;
    })[0];
}

export function getRevisionDeltaSummary(
  file: FileEntry | undefined,
  files: FileEntry[]
): RevisionDeltaSummary | undefined {
  if (!file) return undefined;

  const parent = file.derivedFromFileId
    ? files.find((candidate) => candidate.id === file.derivedFromFileId)
    : undefined;
  const descendants = files.filter((candidate) => candidate.derivedFromFileId === file.id);
  const latestDescendant = latestByTimestamp(descendants);

  if (!parent && descendants.length === 0) return undefined;

  if (!parent) {
    return {
      descendants,
      latestDescendant,
      metrics: [],
      issuesCleared: 0,
      issuesIntroduced: 0,
      validationChanged: false
    };
  }

  const currentScore = computeDisplayedAutomatedScore({
    auditResult: file.postRemediationAudit,
    variant: 'remediated',
    verapdfResult: file.verapdfResult
  });
  const previousScore = computeDisplayedAutomatedScore({
    auditResult: parent.postRemediationAudit,
    variant: 'remediated',
    verapdfResult: parent.verapdfResult
  });
  const currentFindings = file.postRemediationAudit?.findings.length ?? 0;
  const previousFindings = parent.postRemediationAudit?.findings.length ?? 0;
  const currentFailedRules = getVerapdfUnavailableReason(file.verapdfResult)
    ? undefined
    : file.verapdfResult?.summary?.failedRules;
  const previousFailedRules = getVerapdfUnavailableReason(parent.verapdfResult)
    ? undefined
    : parent.verapdfResult?.summary?.failedRules;
  const currentStatus = getAccessibilityStatus(file);
  const previousStatus = getAccessibilityStatus(parent);
  const currentFingerprints = findingsFingerprint(file);
  const previousFingerprints = findingsFingerprint(parent);
  const issuesCleared = [...previousFingerprints].filter((fingerprint) => !currentFingerprints.has(fingerprint)).length;
  const issuesIntroduced = [...currentFingerprints].filter((fingerprint) => !previousFingerprints.has(fingerprint)).length;

  const metrics: RevisionDeltaMetric[] = [
    {
      label: 'Automated baseline',
      previousValue: typeof previousScore === 'number' ? `${previousScore}%` : 'Unavailable',
      currentValue: typeof currentScore === 'number' ? `${currentScore}%` : 'Unavailable',
      trend: compareScores(currentScore, previousScore)
    },
    {
      label: 'Internal findings',
      previousValue: String(previousFindings),
      currentValue: String(currentFindings),
      trend: compareCounts(currentFindings, previousFindings)
    },
    {
      label: 'Failed PDF/UA rules',
      previousValue: formatCount(previousFailedRules),
      currentValue: formatCount(currentFailedRules),
      trend: compareCounts(currentFailedRules, previousFailedRules)
    },
    {
      label: 'Publish decision',
      previousValue: previousStatus.label,
      currentValue: currentStatus.label,
      trend: compareStatus(currentStatus, previousStatus)
    }
  ];

  return {
    parent,
    descendants,
    latestDescendant,
    metrics,
    issuesCleared,
    issuesIntroduced,
    validationChanged:
      getVerapdfComplianceVerdict(parent.verapdfResult) !== getVerapdfComplianceVerdict(file.verapdfResult)
  };
}
