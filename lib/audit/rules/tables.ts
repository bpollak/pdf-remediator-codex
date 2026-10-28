import type { AuditRule } from '../types';
import { detectTables } from '@/lib/remediate/heuristics';

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

      // Data cells without any header cell: a screen reader cannot announce
      // which row or column a value belongs to.
      const hasHeaderCells =
        parsed.tags.some((t) => t.type === 'TH') || (parsed.structureBinding?.headerCellStructCount ?? 0) > 0;
      if (!hasHeaderCells) {
        return [{
          ruleId: 'TBL-001',
          category: 'Tables',
          severity: 'major',
          description: 'Table has no header cells (TH); only data cells (TD) are tagged.',
          wcagCriterion: '1.3.1 Info and Relationships',
          location: { page: tablePages.find((page) => typeof page === 'number'), element: 'Table' },
          recommendation: 'Tag the header row or column cells as TH (with Scope) so each value can be related to its header.',
          autoFixable: false
        }];
      }
      return [];
    }
  },
  {
    id: 'TBL-002',
    evaluate: ({ parsed }) => {
      // Skip if document already has table tags
      const hasTableTags = parsed.tags.some((t) => t.type === 'Table');
      if (hasTableTags) return [];

      const detected = detectTables(parsed);
      if (detected.length === 0) return [];

      return [{
        ruleId: 'TBL-002',
        category: 'Tables',
        severity: 'major',
        description: `Detected ${detected.length} tabular layout(s) without semantic table tags.`,
        wcagCriterion: '1.3.1 Info and Relationships',
        location: { page: detected[0]!.page },
        recommendation: 'Add Table, TR, TH, and TD tags so screen readers can convey row/column relationships.',
        autoFixable: true
      }];
    }
  }
];
