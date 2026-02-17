import type { AuditRule } from '../types';

export const tableRules: AuditRule[] = [
  {
    id: 'TBL-001',
    evaluate: ({ parsed }) => {
      const tablePages = parsed.tags
        .filter((t) => t.type === 'Table')
        .map((t) => t.page);
      if (tablePages.length === 0) return [];

      const trPages = new Set(parsed.tags.filter((t) => t.type === 'TR').map((t) => t.page));
      const missingRow = tablePages.some((page) => !trPages.has(page));

      const hasCells = parsed.tags.some((t) => t.type === 'TH' || t.type === 'TD');

      if (missingRow || (!hasCells && tablePages.length > 0)) {
        return [{
          ruleId: 'TBL-001',
          category: 'Tables',
          severity: 'major',
          description: 'Table tags missing proper row or cell structure.',
          wcagCriterion: '1.3.1 Info and Relationships',
          location: { element: 'Table' },
          recommendation: 'Ensure Table > TR > TH/TD hierarchy.',
          autoFixable: true
        }];
      }
      return [];
    }
  }
];
