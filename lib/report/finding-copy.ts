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

/**
 * Plain-language copy for the results page, which is written for people who
 * are not accessibility specialists. `todo` names the problem as a task, `how`
 * says how to fix it without PDF jargon, and `fixed` describes it once the
 * app has resolved it.
 */
const plainCopy: Record<string, { todo: string; how: string; fixed: string }> = {
  'DOC-001': {
    todo: 'Mark the PDF as following the accessibility standard (PDF/UA)',
    how: 'Export the PDF again from the source file with tagging turned on, or ask accessibility staff to fix it in Acrobat Pro.',
    fixed: 'Marked the PDF as following the PDF/UA accessibility standard'
  },
  'DOC-002': {
    todo: 'Add the hidden structure (tags) that screen readers need',
    how: 'Export the PDF again from the source file (Word, PowerPoint, Google Docs) as a tagged PDF, or add tags in Acrobat Pro.',
    fixed: 'Added the hidden structure (tags) that screen readers use'
  },
  'DOC-003': {
    todo: 'Set the document language',
    how: 'In Acrobat Pro, choose File → Properties → Advanced and set the language. In Word, set it under Review → Language before exporting.',
    fixed: 'Set the document language'
  },
  'DOC-004': {
    todo: 'Make the scanned text readable (OCR)',
    how: 'In Acrobat Pro, use Scan & OCR → Recognize text. Better still, export the PDF again from the original file if you have it.',
    fixed: 'Made the scanned text readable (OCR)'
  },
  'DOC-005': {
    todo: 'Connect the hidden structure (tags) to the page content',
    how: 'Export the PDF again from the source file as a tagged PDF, or ask accessibility staff to repair the tags in Acrobat Pro.',
    fixed: 'Connected the hidden structure (tags) to the page content'
  },
  'HDG-001': {
    todo: 'Fix heading levels so none are skipped',
    how: 'In the source file, use the built-in Heading 1, Heading 2 and Heading 3 styles in order, then export the PDF again.',
    fixed: 'Fixed skipped heading levels'
  },
  'HDG-002': {
    todo: 'Add headings',
    how: 'In the source file, use the built-in heading styles for section titles, then export the PDF again.',
    fixed: 'Added headings'
  },
  'IMG-001': {
    todo: 'Describe each meaningful image',
    how: 'Write a short description for each image that carries information, and mark purely decorative images as decorative.',
    fixed: 'Added image descriptions'
  },
  'IMG-002': {
    todo: 'Replace image descriptions that look like file names',
    how: 'Write a description of what the image shows instead of its file name.',
    fixed: 'Replaced image descriptions that looked like file names'
  },
  'TBL-001': {
    todo: 'Fix table structure',
    how: 'In the source file, build the table with the table tool and mark the header row, then export the PDF again.',
    fixed: 'Fixed table structure'
  },
  'TBL-002': {
    todo: 'Mark tables as real tables',
    how: 'In the source file, build the table with the table tool instead of tabs or spaces, then export the PDF again.',
    fixed: 'Marked tables as real tables'
  },
  'LST-001': {
    todo: 'Mark lists as real lists',
    how: 'In the source file, use the bullet or numbering button instead of typed characters, then export the PDF again.',
    fixed: 'Marked lists as real lists'
  },
  'LNK-001': {
    todo: 'Rewrite unclear link text',
    how: 'Change links like “click here” so the text says where the link goes.',
    fixed: 'Rewrote unclear link text'
  },
  'LNK-002': {
    todo: 'Add bookmarks',
    how: 'In Word, use heading styles and choose “Create bookmarks using headings” when you save as PDF.',
    fixed: 'Added bookmarks for navigation'
  },
  'FRM-001': {
    todo: 'Label each form field',
    how: 'In Acrobat Pro, open Prepare Form and give each field a clear name in its tooltip.',
    fixed: 'Labeled form fields'
  },
  'FRM-002': {
    todo: 'Mark required form fields',
    how: 'In Acrobat Pro, open Prepare Form and set “Required” on each field that must be filled in.',
    fixed: 'Marked required form fields'
  },
  'META-001': {
    todo: 'Add a document subject',
    how: 'Fill in the subject in the source file’s document properties, or in Acrobat Pro under File → Properties.',
    fixed: 'Added a document subject'
  },
  'META-002': {
    todo: 'Make the keyboard tab order follow the document structure',
    how: 'In Acrobat Pro, open Page Thumbnails → Page Properties and set Tab Order to “Use Document Structure”.',
    fixed: 'Set the keyboard tab order to follow the document structure'
  },
  'CLR-001': {
    todo: 'Check color contrast',
    how: 'Make sure text is dark enough against its background (a contrast ratio of at least 4.5 to 1), then export again.',
    fixed: 'Improved color contrast'
  }
};

const categoryNoun: Record<AuditFinding['category'], string> = {
  'Document Structure': 'document structure',
  'Headings & Structure': 'heading',
  'Images & Non-Text Content': 'image',
  Tables: 'table',
  Lists: 'list',
  'Links & Navigation': 'link',
  'Color & Visual': 'color',
  Forms: 'form',
  'Metadata & Navigation': 'document details'
};

function categoryHowTo(category: AuditFinding['category']): string {
  if (category === 'Metadata & Navigation') {
    return 'Fill in the document details in the source file (in Word: File → Info → Properties) and export the PDF again, or set them in Acrobat Pro under File → Properties.';
  }
  if (category === 'Forms') {
    return 'In Acrobat Pro, open Prepare Form and fix each field listed in the technical report.';
  }
  return 'Fix it in the source file (Word, PowerPoint, Google Docs) and export the PDF again, or fix it in Acrobat Pro.';
}

/** Plain task title. Rules without written copy fall back to the audit's own description. */
export function findingPlainTitle(finding: AuditFinding): string {
  return plainCopy[finding.ruleId]?.todo ?? (finding.description.trim().replace(/\.$/, '') || findingActionTitle(finding));
}

export function findingPlainHowTo(finding: AuditFinding): string {
  return plainCopy[finding.ruleId]?.how ?? categoryHowTo(finding.category);
}

/** Past-tense line for "What we fixed automatically". */
export function findingFixedLabel(finding: AuditFinding): string {
  return plainCopy[finding.ruleId]?.fixed ?? `Fixed a ${categoryNoun[finding.category] ?? 'document'} problem`;
}

/** Names a check that could not run, e.g. "color contrast". */
export function notCheckedLabel(ruleId: string): string {
  if (ruleId.startsWith('CLR-')) return 'color contrast';
  return `automated check ${ruleId}`;
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
