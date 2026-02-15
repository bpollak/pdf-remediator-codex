import type { AuditRule } from '../types';

export const linkRules: AuditRule[] = [
  {
    id: 'LNK-001',
    evaluate: ({ parsed }) =>
      parsed.links
        .filter((link) => /^(click here|read more|https?:\/\/)/i.test(link.text.trim()))
        .map((link) => ({
          ruleId: 'LNK-001',
          category: 'Links & Navigation',
          severity: 'major',
          description: 'Link text is not meaningful out of context.',
          wcagCriterion: '2.4.4 Link Purpose (In Context)',
          location: { page: link.page, element: link.text },
          recommendation: 'Use descriptive link text.',
          autoFixable: false
        }))
  },
  {
    id: 'LNK-002',
    evaluate: ({ parsed }) =>
      parsed.pageCount > 4 && parsed.outlines.length === 0
        ? [{
            ruleId: 'LNK-002',
            category: 'Links & Navigation',
            severity: 'minor',
            description: 'Long document is missing bookmarks/outlines.',
            wcagCriterion: '2.4.5 Multiple Ways',
            location: {},
            recommendation: 'Generate outline entries from headings.',
            autoFixable: true
          }]
        : []
  }
];
