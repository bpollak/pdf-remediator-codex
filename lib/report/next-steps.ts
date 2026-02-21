import type { AuditFinding } from '@/lib/audit/types';
import type { RemediationStopReason } from '@/lib/remediate/loop';
import type { VerapdfResult } from '@/lib/verapdf/types';

export interface NextStepItem {
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
}

function severityWeight(severity: AuditFinding['severity']): number {
  if (severity === 'critical') return 3;
  if (severity === 'major') return 2;
  return 1;
}

function toPriority(severity: AuditFinding['severity']): NextStepItem['severity'] {
  if (severity === 'critical') return 'high';
  if (severity === 'major') return 'medium';
  return 'low';
}

function uniqueBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function stopReasonMessage(reason: RemediationStopReason | undefined): string | undefined {
  if (!reason) return undefined;
  if (reason === 'no_improvement') return 'Automated passes stopped because failed veraPDF checks did not improve.';
  if (reason === 'no_change') return 'Automated passes stopped because the output PDF stopped changing.';
  if (reason === 'max_iterations') return 'Automated passes reached the configured maximum iterations.';
  if (reason === 'service_unavailable') return 'Automated passes stopped because external veraPDF verification was unavailable.';
  return undefined;
}

export function buildManualNextSteps(input: {
  remediatedFindings: AuditFinding[];
  verapdfResult?: VerapdfResult;
  remediationStopReason?: RemediationStopReason;
}): NextStepItem[] {
  const { remediatedFindings, verapdfResult, remediationStopReason } = input;
  const steps: NextStepItem[] = [];

  if (verapdfResult?.compliant === false) {
    const failedRules = verapdfResult.summary?.failedRules;
    const failedChecks = verapdfResult.summary?.failedChecks;
    steps.push({
      title: 'Review remaining PDF/UA failures in a desktop checker',
      description: `veraPDF still reports non-compliance${typeof failedRules === 'number' ? ` (${failedRules} failed rules` : ''}${typeof failedChecks === 'number' ? `${typeof failedRules === 'number' ? ', ' : ' ('}${failedChecks} failed checks` : ''}${typeof failedRules === 'number' || typeof failedChecks === 'number' ? ')' : ''}. Open the remediated PDF in PAC or Acrobat Accessibility Checker and inspect the failed checks list.`,
      severity: 'high'
    });
  }

  const topFindings = uniqueBy(
    remediatedFindings
      .slice()
      .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
      .slice(0, 5),
    (finding) => finding.ruleId
  );

  for (const finding of topFindings) {
    steps.push({
      title: `${finding.ruleId}: ${finding.description}`,
      description: `${finding.recommendation}${finding.location.page ? ` (Page ${finding.location.page})` : ''}`,
      severity: toPriority(finding.severity)
    });
  }

  const stopMessage = stopReasonMessage(remediationStopReason);
  if (stopMessage) {
    steps.push({
      title: 'Re-run after manual fixes',
      description: `${stopMessage} After manual edits, re-upload the updated PDF to run remediation and verification again.`,
      severity: 'medium'
    });
  }

  if (steps.length === 0) {
    steps.push({
      title: 'No manual steps required',
      description: 'No remaining internal findings were detected and external verification did not report an actionable failure.',
      severity: 'low'
    });
  } else {
    steps.push({
      title: 'Final verification pass',
      description: 'After manual updates, upload the revised PDF and confirm both internal score and veraPDF verification improve.',
      severity: 'low'
    });
  }

  return steps;
}
