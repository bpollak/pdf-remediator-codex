import type { AuditRule } from '../types';
import { LIST_ITEM_PATTERN } from '@/lib/utils/patterns';

/** List-looking lines on one page before they are expected to be a list. */
const MIN_LIST_LINES = 3;

export const listRules: AuditRule[] = [
  {
    id: 'LST-001',
    evaluate: ({ parsed }) => {
      const listLinesByPage = new Map<number, number>();
      for (const item of parsed.textItems) {
        if (!LIST_ITEM_PATTERN.test(item.text)) continue;
        listLinesByPage.set(item.page, (listLinesByPage.get(item.page) ?? 0) + 1);
      }
      const fakeListLines = [...listLinesByPage.values()].reduce((sum, count) => sum + count, 0);
      const listTags = parsed.tags.filter((t) => t.type === 'L' || t.type === 'LI');

      // Without any list tag, list-looking text is a failure as before.
      // With list tags, judge page by page: one tagged list elsewhere does
      // not cover list-looking text on a page that has none.
      const tagPagesKnown = listTags.length > 0 && listTags.every((t) => typeof t.page === 'number');
      const listTagPages = new Set(listTags.map((t) => t.page));
      const untaggedListPages =
        listTags.length === 0
          ? fakeListLines >= MIN_LIST_LINES
            ? [...listLinesByPage.keys()]
            : []
          : tagPagesKnown
            ? [...listLinesByPage.entries()]
                .filter(([page, count]) => count >= MIN_LIST_LINES && !listTagPages.has(page))
                .map(([page]) => page)
            : [];

      if (untaggedListPages.length === 0) return [];
      return [{
        ruleId: 'LST-001',
        category: 'Lists',
        severity: 'major',
        description:
          listTags.length === 0
            ? 'List-like text found without semantic list tags.'
            : `List-like text on page ${untaggedListPages.slice(0, 5).join(', ')} is not inside list tags.`,
        wcagCriterion: '1.3.1 Info and Relationships',
        location: listTags.length === 0 ? {} : { page: untaggedListPages[0] },
        recommendation: 'Use L, LI, Lbl, and LBody tags.',
        autoFixable: true
      }];
    }
  }
];
