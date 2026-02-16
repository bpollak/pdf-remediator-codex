import type { ParsedPDF } from '@/lib/pdf/types';

interface HeadingCandidate {
  text: string;
  level: number;
  page: number;
}

const listPattern = /^([\u2022\-*]|\d+[.)]|[a-zA-Z][.)])\s+/;

function deriveBodyFontSize(parsed: ParsedPDF): number {
  const frequencies = new Map<number, number>();
  for (const item of parsed.textItems) {
    const key = Math.round(item.fontSize * 10) / 10;
    frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
  }

  let mostCommonSize = 12;
  let maxCount = 0;
  for (const [size, count] of frequencies.entries()) {
    if (count > maxCount) {
      maxCount = count;
      mostCommonSize = size;
    }
  }
  return mostCommonSize;
}

function toHeadingLevel(fontSize: number, rankedSizes: number[]): number {
  const idx = rankedSizes.findIndex((size) => Math.abs(size - fontSize) <= 0.1);
  return idx >= 0 ? Math.min(6, idx + 1) : 6;
}

function normalizeHeadingLevels(headings: HeadingCandidate[]): HeadingCandidate[] {
  const normalized: HeadingCandidate[] = [];
  let previousLevel = 1;

  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i]!;
    let level = heading.level;
    if (i === 0) {
      level = 1;
    } else if (level > previousLevel + 1) {
      level = previousLevel + 1;
    }

    previousLevel = Math.max(1, Math.min(6, level));
    normalized.push({ ...heading, level: previousLevel });
  }

  return normalized;
}

function cleanHeadingText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function looksLikeHeadingText(text: string): boolean {
  if (!text || text.length > 110) return false;
  if (listPattern.test(text)) return false;
  if (/^[\d.\s]+$/.test(text)) return false;

  const alphaChars = (text.match(/[A-Za-z]/g) ?? []).length;
  if (alphaChars < 2) return false;

  return true;
}

function dedupeHeadings(headings: HeadingCandidate[]): HeadingCandidate[] {
  const seen = new Set<string>();
  const deduped: HeadingCandidate[] = [];

  for (const heading of headings) {
    const key = `${heading.page}|${heading.level}|${heading.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(heading);
  }
  return deduped;
}

export function detectHeadings(parsed: ParsedPDF): HeadingCandidate[] {
  const bodySize = deriveBodyFontSize(parsed);
  const candidateItems = parsed.textItems
    .filter((item) => {
      const text = cleanHeadingText(item.text);
      if (!looksLikeHeadingText(text)) return false;

      const appearsBold = item.bold || /bold|black|demi|semi/i.test(item.fontName);
      const significantlyLarger = item.fontSize >= bodySize + 1.5;

      return appearsBold || significantlyLarger;
    })
    .map((item) => ({
      ...item,
      text: cleanHeadingText(item.text)
    }));

  if (!candidateItems.length) return [];

  const rankedSizes = [...new Set(candidateItems.map((item) => Math.round(item.fontSize * 10) / 10))]
    .sort((a, b) => b - a)
    .slice(0, 6);

  const ordered = candidateItems
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)
    .map((item) => ({
      text: item.text,
      level: toHeadingLevel(Math.round(item.fontSize * 10) / 10, rankedSizes),
      page: item.page
    }));

  return normalizeHeadingLevels(dedupeHeadings(ordered));
}

export function detectListItems(parsed: ParsedPDF): Array<{ text: string; page: number }> {
  return parsed.textItems
    .map((item) => ({ ...item, text: item.text.replace(/\s+/g, ' ').trim() }))
    .filter((item) => listPattern.test(item.text) && item.text.length <= 300)
    .map((item) => ({ text: item.text, page: item.page }));
}

export function detectParagraphs(parsed: ParsedPDF): Array<{ text: string; page: number }> {
  return parsed.textItems
    .map((item) => ({ ...item, text: item.text.replace(/\s+/g, ' ').trim() }))
    .filter((item) => item.text.length > 0 && !listPattern.test(item.text))
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)
    .slice(0, 600)
    .map((item) => ({ text: item.text, page: item.page }));
}
