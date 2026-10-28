import type { AuditFinding, AuditRule } from '../types';

/** Titles that authoring tools fill in by default. */
const PLACEHOLDER_TITLE =
  /^(untitled|untitled document|no title|title|document|new document|unknown|default|pdf|accessible remediated pdf|(document|presentation|book|sheet|slide)\s*\d*)$/i;
/** Titles that are an application's "<App> - <file name>" window caption. */
const APPLICATION_CAPTION_TITLE = /^(microsoft (word|powerpoint|excel|publisher)\s+-\s|untitled\b)/i;
/** Titles that are (or end in) a file name, or a path. */
const FILENAME_TITLE =
  /\.(docx?|dotx?|pptx?|ppsx?|xlsx?|pdf|rtf|odt|odp|ods|txt|pages|key|numbers|indd|tiff?|jpe?g|png)$|^[a-z]:\\|[\\/][^\s\\/]+\.[a-z0-9]{2,4}$|^[\w-]*_[\w-]*$/i;

function titleProblem(title: string | undefined): string | undefined {
  const normalized = title?.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Document title is missing.';
  if (PLACEHOLDER_TITLE.test(normalized) || APPLICATION_CAPTION_TITLE.test(normalized)) {
    return `Document title "${normalized}" is a placeholder, not a real title.`;
  }
  if (FILENAME_TITLE.test(normalized)) return `Document title "${normalized}" looks like a file name.`;
  return undefined;
}

// Subject metadata is not required by WCAG or PDF/UA, so it is not audited
// (the former META-001 cost points while citing 2.4.2 Page Titled, which is
// about the title).
export const metadataRules: AuditRule[] = [
  {
    id: 'META-002',
    evaluate: ({ parsed }) =>
      parsed.hasStructTree
        ? []
        : [{
            ruleId: 'META-002',
            category: 'Metadata & Navigation',
            severity: 'major',
            description: 'Cannot confirm structure-based tab order.',
            wcagCriterion: '2.4.3 Focus Order',
            location: {},
            recommendation: 'Set page tabs to follow structure order (/Tabs /S).',
            autoFixable: true
          }]
  },
  {
    id: 'META-003',
    evaluate: ({ parsed }): AuditFinding[] => {
      const problem = titleProblem(parsed.title);
      return problem
        ? [{
            ruleId: 'META-003',
            category: 'Metadata & Navigation',
            severity: 'major',
            description: problem,
            wcagCriterion: '2.4.2 Page Titled',
            location: {},
            recommendation: 'Give the document a descriptive title in its properties (Title), and show it in the window title bar.',
            autoFixable: false
          }]
        : [];
    }
  }
];
