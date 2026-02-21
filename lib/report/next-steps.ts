import type { AuditFinding } from '@/lib/audit/types';
import type { RemediationStopReason } from '@/lib/remediate/loop';
import type { VerapdfResult } from '@/lib/verapdf/types';
import { findingActionTitle, findingDescription, findingDetails } from './finding-copy';

export interface NextStepItem {
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  details?: string;
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
  if (reason === 'no_improvement') return 'Automation stopped because failed external checks were not improving.';
  if (reason === 'no_change') return 'Automation stopped because another pass produced the same PDF output.';
  if (reason === 'max_iterations') return 'Automation stopped after reaching the maximum number of remediation passes.';
  if (reason === 'service_unavailable') return 'Automation stopped because external veraPDF verification was unavailable.';
  return undefined;
}

export function buildManualNextSteps(input: {
  remediatedFindings: AuditFinding[];
  verapdfResult?: VerapdfResult;
  remediationStopReason?: RemediationStopReason;
}): NextStepItem[] {
  const { remediatedFindings, verapdfResult, remediationStopReason } = input;
  const steps: NextStepItem[] = [];
  const manualPathHint =
    'If you use Acrobat, fix issues in Tags and Accessibility Checker. If you edit in Word or PowerPoint, update the source file, export a new PDF, then re-upload.';

  if (verapdfResult?.compliant === false) {
    const failedRules = verapdfResult.summary?.failedRules;
    const failedChecks = verapdfResult.summary?.failedChecks;
    const counts =
      typeof failedRules === 'number' || typeof failedChecks === 'number'
        ? ` (${typeof failedRules === 'number' ? `${failedRules} failed rules` : ''}${
            typeof failedRules === 'number' && typeof failedChecks === 'number' ? ', ' : ''
          }${typeof failedChecks === 'number' ? `${failedChecks} failed checks` : ''})`
        : '';
    steps.push({
      title: 'Open the remediated PDF in Acrobat or PAC',
      description: `veraPDF still reports PDF/UA failures${counts}. Start with failed rules first, then remaining failed checks. ${manualPathHint}`,
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
      title: findingActionTitle(finding),
      description: findingDescription(finding),
      severity: toPriority(finding.severity),
      details: findingDetails(finding)
    });
  }

  const stopMessage = stopReasonMessage(remediationStopReason);
  if (stopMessage) {
    steps.push({
      title: 'Upload the updated PDF after manual edits',
      description: `${stopMessage} ${manualPathHint} Once you make changes, upload the revised file to run remediation and verification again.`,
      severity: 'medium'
    });
  }

  if (steps.length === 0) {
    steps.push({
      title: 'No manual fixes required right now',
      description: 'No remaining internal findings were detected, and external verification did not report actionable failures.',
      severity: 'low'
    });
  } else {
    steps.push({
      title: 'Run one final verification before publishing',
      description: 'After manual updates, upload the revised PDF and confirm both the internal score and veraPDF result improve.',
      severity: 'low'
    });
  }

  return steps;
}
