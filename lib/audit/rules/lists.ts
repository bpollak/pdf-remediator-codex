import type { AuditRule } from '../types';
import { LIST_ITEM_PATTERN } from '@/lib/utils/patterns';

export const listRules: AuditRule[] = [
  {
    id: 'LST-001',
    evaluate: ({ parsed }) => {
      const fakeListLines = parsed.textItems.filter((item) => LIST_ITEM_PATTERN.test(item.text)).length;
      const semanticLists = parsed.tags.filter((t) => t.type === 'L').length;
      return fakeListLines > 2 && semanticLists === 0
        ? [{
            ruleId: 'LST-001',
            category: 'Lists',
            severity: 'major',
            description: 'List-like text found without semantic list tags.',
            wcagCriterion: '1.3.1 Info and Relationships',
            location: {},
            recommendation: 'Use L, LI, Lbl, and LBody tags.',
            autoFixable: true
          }]
        : [];
    }
  }
];
