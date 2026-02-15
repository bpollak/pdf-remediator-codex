import type { ParsedPDF } from '@/lib/pdf/types';

export function detectHeadings(parsed: ParsedPDF): Array<{ text: string; level: number; page: number }> {
  const sortedSizes = [...new Set(parsed.textItems.map((item) => item.fontSize))].sort((a, b) => b - a);
  const topSizes = sortedSizes.slice(0, 6);
  return parsed.textItems
    .filter((item) => topSizes.includes(item.fontSize) && item.text.length <= 100)
    .map((item) => ({
      text: item.text,
      level: Math.min(6, topSizes.indexOf(item.fontSize) + 1),
      page: item.page
    }));
}

export function detectListItems(parsed: ParsedPDF): Array<{ text: string; page: number }> {
  return parsed.textItems
    .filter((item) => /^([\u2022\-]|\d+[.)])\s+/.test(item.text))
    .map((item) => ({ text: item.text, page: item.page }));
}
