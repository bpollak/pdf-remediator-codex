import type { AuditRule, AuditFinding } from '../types';
import { contrastRatio } from '@/lib/utils/contrast';

const WHITE: [number, number, number] = [255, 255, 255];
const AA_NORMAL_RATIO = 4.5;
const AA_LARGE_RATIO = 3;
const LARGE_TEXT_SIZE = 18;
const LARGE_BOLD_TEXT_SIZE = 14;

function parseColorString(color: string): [number, number, number] | null {
  const match = color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (match) {
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  const hexMatch = color.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hexMatch) {
    return [parseInt(hexMatch[1], 16), parseInt(hexMatch[2], 16), parseInt(hexMatch[3], 16)];
  }
  return null;
}

export const colorRules: AuditRule[] = [
  {
    id: 'CLR-001',
    evaluate: ({ parsed }) => {
      const findings: AuditFinding[] = [];
      const flaggedPages = new Set<number>();

      for (const item of parsed.textItems) {
        if (!item.color) continue;
        const fg = parseColorString(item.color);
        if (!fg) continue;

        const ratio = contrastRatio(fg, WHITE);
        const isLargeText =
          item.fontSize >= LARGE_TEXT_SIZE ||
          (item.bold && item.fontSize >= LARGE_BOLD_TEXT_SIZE);
        const threshold = isLargeText ? AA_LARGE_RATIO : AA_NORMAL_RATIO;

        if (ratio < threshold && !flaggedPages.has(item.page)) {
          flaggedPages.add(item.page);
          // Background color is assumed white since actual background cannot be
          // reliably extracted; use minor severity to reflect this uncertainty.
          findings.push({
            ruleId: 'CLR-001',
            category: 'Color & Visual',
            severity: 'minor',
            description: `Text may have insufficient contrast ratio (${ratio}:1) against assumed white background.`,
            wcagCriterion: '1.4.3 Contrast (Minimum)',
            location: { page: item.page },
            recommendation: 'Verify text contrast against the actual page background meets WCAG AA ratio of 4.5:1 (3:1 for large text).',
            autoFixable: false
          });
        }
      }
      return findings;
    }
  },
  {
    id: 'CLR-002',
    evaluate: () => []
  }
];
