import type { AuditFinding } from '@/lib/audit/types';

export function ensureSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function findingActionTitle(finding: AuditFinding): string {
  switch (finding.ruleId) {
    case 'DOC-001':
      return 'Add PDF accessibility metadata (PDF/UA)';
    case 'DOC-002':
      return 'Add accessibility tags to the document';
    case 'DOC-003':
      return 'Set the document language';
    case 'DOC-004':
      return 'Run OCR and rebuild tags for scanned content';
    case 'DOC-005':
      return 'Bind tags to real page content before publishing';
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
  const fixHint = manualFixHint(finding.ruleId);
  const location: string[] = [];
  if (typeof finding.location.page === 'number') {
    location.push(`Page ${finding.location.page}`);
  }
  if (finding.location.element) {
    location.push(`Element: ${finding.location.element}`);
  }
  const where = location.length > 0 ? ` Where: ${location.join(' • ')}.` : '';
  const how = fixHint ? ` How to fix it: ${ensureSentence(fixHint)}` : '';
  return `Do this: ${ensureSentence(finding.recommendation)}${how}${where}`;
}

export function findingDetails(finding: AuditFinding): string {
  const wcag = finding.wcagCriterion ? ` • WCAG ${finding.wcagCriterion}` : '';
  return `Rule ${finding.ruleId}${wcag}`;
}

function manualFixHint(ruleId: string): string | undefined {
  switch (ruleId) {
    case 'DOC-001':
      return 'In Acrobat: File → Properties → Advanced, set PDF/UA and verify Title/Author fields are populated.';
    case 'DOC-002':
      return 'Open Accessibility tools, run Autotag Document, then review and correct the Tags tree manually.';
    case 'DOC-003':
      return 'Set the primary language in document properties and confirm non-default language spans are tagged.';
    case 'DOC-004':
      return 'Run OCR on scanned pages first, then regenerate tags and reading order before saving.';
    case 'DOC-005':
      return 'In Acrobat Tags, ensure each StructElem expands to marked content and validate ParentTree/MCID associations.';
    case 'HDG-001':
    case 'HDG-002':
      return 'Apply real heading tags (H1/H2/H3) in sequence and keep one clear H1 near the document start.';
    case 'IMG-001':
    case 'IMG-002':
      return 'In Tags or Reading Order, mark decorative images as artifacts and add descriptive alt text for informative images.';
    case 'TBL-001':
    case 'TBL-002':
      return 'Retag each table with Table/TR/TH/TD structure and ensure header cells are identified correctly.';
    case 'LST-001':
      return 'Convert repeated bullet-like paragraphs into proper L/LI/Lbl/LBody list tags.';
    case 'LNK-001':
      return 'Edit hyperlink text so it describes destination or action without relying on surrounding context.';
    case 'LNK-002':
      return 'Create bookmarks from major headings and confirm bookmark order matches reading order.';
    case 'FRM-001':
    case 'FRM-002':
      return 'Open Prepare Form, provide a clear tooltip/accessible name for each field, and flag required fields programmatically.';
    case 'META-001':
      return 'Add meaningful subject metadata that describes the document purpose.';
    case 'META-002':
      return 'Set tab order to Use Document Structure so keyboard navigation follows logical reading order.';
    case 'CLR-001':
      return 'Adjust text or background colors to meet contrast requirements, then re-check with a contrast analyzer.';
    default:
      return undefined;
  }
}
