import type { AuditRule } from '../types';

const headingPattern = /^H([1-6])$/;

export const headingRules: AuditRule[] = [
  {
    id: 'HDG-001',
    evaluate: ({ parsed }) => {
      const headings = parsed.tags
        .filter((t) => headingPattern.test(t.type))
        .sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
      const levels = headings.map((h) => Number(h.type.slice(1)));
      const skipped = levels.some((level, idx) => idx > 0 && level - levels[idx - 1]! > 1);
      return skipped
        ? [{
            ruleId: 'HDG-001',
            category: 'Headings & Structure',
            severity: 'major',
            description: 'Skipped heading level detected.',
            wcagCriterion: '1.3.1 Info and Relationships',
            location: { element: 'Heading tree' },
            recommendation: 'Maintain contiguous heading levels.',
            autoFixable: true
          }]
        : [];
    }
  },
  {
    id: 'HDG-002',
    evaluate: ({ parsed }) => {
      const headings = parsed.tags.filter((t) => headingPattern.test(t.type));
      return parsed.pageCount > 1 && headings.length === 0
        ? [{
            ruleId: 'HDG-002',
            category: 'Headings & Structure',
            severity: 'minor',
            description: 'No headings detected in multi-page document.',
            wcagCriterion: '2.4.6 Headings and Labels',
            location: {},
            recommendation: 'Add section headings.',
            autoFixable: true
          }]
        : [];
    }
  }
];
