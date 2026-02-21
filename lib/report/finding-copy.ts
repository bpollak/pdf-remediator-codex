import type { AuditFinding } from '@/lib/audit/types';

export function ensureSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function findingActionTitle(finding: AuditFinding): string {
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

export function findingDescription(finding: AuditFinding): string {
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

export function findingDetails(finding: AuditFinding): string {
  const wcag = finding.wcagCriterion ? ` • WCAG ${finding.wcagCriterion}` : '';
  return `Rule ${finding.ruleId}${wcag}`;
}
