import type { AuditRule } from '../types';

export const tableRules: AuditRule[] = [
  {
    id: 'TBL-001',
    evaluate: ({ parsed }) => {
      const tableNodes = parsed.tags.filter((t) => t.type === 'Table');
      return tableNodes.some((table) => !parsed.tags.find((t) => t.type === 'TR' && t.page === table.page))
        ? [{
            ruleId: 'TBL-001',
            category: 'Tables',
            severity: 'major',
            description: 'Table tags missing row structure.',
            wcagCriterion: '1.3.1 Info and Relationships',
            location: { element: 'Table' },
            recommendation: 'Ensure Table > TR > TH/TD hierarchy.',
            autoFixable: true
          }]
        : [];
    }
  }
];
