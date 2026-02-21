import type { AuditFinding } from '@/lib/audit/types';
import type { RemediationStopReason } from '@/lib/remediate/loop';
import type { VerapdfResult } from '@/lib/verapdf/types';

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

function ensureSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function findingActionTitle(finding: AuditFinding): string {
  switch (finding.ruleId) {
    case 'DOC-001':
      return 'Add PDF/UA document metadata';
    case 'DOC-002':
      return 'Add accessibility tags to the document';
    case 'DOC-003':
      return 'Set the document language';
    case 'DOC-004':
      return 'Run OCR and rebuild tags for scanned content';
    case 'HDG-001':
      return 'Fix heading levels so they do not skip';
    case 'HDG-002':
      return 'Add headings to organize the document';
    case 'IMG-001':
      return 'Write alt text for each meaningful image';
    case 'IMG-002':
      return 'Replace filename-like alt text';
    case 'TBL-001':
      return 'Fix table structure tags';
    case 'TBL-002':
      return 'Tag visual tables as real tables';
    case 'LST-001':
      return 'Convert list-looking text into tagged lists';
    case 'LNK-001':
      return 'Rewrite unclear link text';
    case 'LNK-002':
      return 'Add bookmarks for easier navigation';
    case 'FRM-001':
      return 'Add labels to form fields';
    case 'FRM-002':
      return 'Mark required fields programmatically';
    case 'META-001':
      return 'Add subject metadata';
    case 'META-002':
      return 'Set tab order to follow structure';
    case 'CLR-001':
      return 'Check and improve color contrast';
    default:
      return `Fix remaining ${finding.category.toLowerCase()} issue`;
  }
}

function findingDescription(finding: AuditFinding): string {
  const location: string[] = [];
  if (typeof finding.location.page === 'number') {
    location.push(`Page ${finding.location.page}`);
  }
  if (finding.location.element) {
    location.push(`Element: ${finding.location.element}`);
  }
  const where = location.length > 0 ? ` Where: ${location.join(' • ')}.` : '';
  return `Do this: ${ensureSentence(finding.recommendation)}${where}`;
}

function findingDetails(finding: AuditFinding): string {
  const wcag = finding.wcagCriterion ? ` • WCAG ${finding.wcagCriterion}` : '';
  return `Rule ${finding.ruleId}${wcag}`;
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
      description: `veraPDF still reports PDF/UA failures${counts}. Review the failed checks and fix them in your source file or tags panel.`,
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
      description: `${stopMessage} Once you make changes, upload the revised file to run remediation and verification again.`,
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
