import type { ParsedPDF } from '@/lib/pdf/types';
import {
  detectHeadingItems,
  detectListItems,
  detectParagraphs,
  detectTables,
  detectArtifacts,
  detectAndReorderColumns
} from './heuristics';

export function extractRemediationPlan(parsed: ParsedPDF) {
  // Apply column reordering per page before detection passes
  const reorderedItems = reorderByColumns(parsed);
  const reorderedParsed = { ...parsed, textItems: reorderedItems };

  const headingItems = detectHeadingItems(reorderedParsed);
  const headingIndices = new Set(headingItems.map((heading) => heading.index));
  const listItems = detectListItems(reorderedParsed, { excludeIndices: headingIndices });
  // Uncapped for the reading order; `paragraphs` keeps its historical cap.
  const allParagraphs = detectParagraphs(reorderedParsed, {
    excludeIndices: headingIndices,
    limit: Number.POSITIVE_INFINITY
  });
  const paragraphs = allParagraphs.slice(0, 400);
  const tables = detectTables(reorderedParsed);
  const artifacts = detectArtifacts(reorderedParsed);

  const readingOrder = buildReadingOrder(headingItems, listItems, allParagraphs);

  return {
    headings: headingItems.map(({ text, level, page }) => ({ text, level, page })),
    listItems,
    paragraphs,
    readingOrder,
    tables,
    artifacts,
    sourceTags: parsed.tags,
    images: parsed.images,
    textItems: reorderedItems,
    links: parsed.links,
    outlines: parsed.outlines,
    forms: parsed.forms,
    metadata: parsed.metadata,
    title: parsed.title,
    hasStructTree: parsed.hasStructTree,
    language: parsed.language,
    pageCount: parsed.pageCount,
  };
}

export interface ReadingOrderEntry {
  role: 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6' | 'P' | 'LI';
  text: string;
  page: number;
  x: number;
  y: number;
  fontSize: number;
}

/**
 * One list of headings, list items and paragraphs in reading order: page
 * first, then the position of each block's first text item in the
 * column-aware item order. Heading lines appear once, as headings.
 */
function buildReadingOrder(
  headings: ReturnType<typeof detectHeadingItems>,
  listItems: ReturnType<typeof detectListItems>,
  paragraphs: ReturnType<typeof detectParagraphs>
): ReadingOrderEntry[] {
  const entries: Array<ReadingOrderEntry & { index: number }> = [
    ...headings.map((heading) => ({
      role: `H${Math.max(1, Math.min(6, heading.level))}` as ReadingOrderEntry['role'],
      text: heading.text,
      page: heading.page,
      index: heading.index,
      x: heading.x,
      y: heading.y,
      fontSize: heading.fontSize
    })),
    ...listItems.map((item) => ({ role: 'LI' as const, ...item })),
    ...paragraphs.map((paragraph) => ({ role: 'P' as const, ...paragraph }))
  ];

  return entries
    .sort((a, b) => a.page - b.page || a.index - b.index)
    .map(({ role, text, page, x, y, fontSize }) => ({ role, text, page, x, y, fontSize }));
}

/** Reorder text items per page to handle multi-column layouts. */
function reorderByColumns(parsed: ParsedPDF) {
  // Estimate page width from text item positions (fallback 612 = letter width)
  const maxX = parsed.textItems.reduce((max, item) => Math.max(max, item.x + item.width), 0);
  const pageWidth = maxX > 100 ? maxX : 612;

  const byPage = new Map<number, typeof parsed.textItems>();
  for (const item of parsed.textItems) {
    let bucket = byPage.get(item.page);
    if (!bucket) {
      bucket = [];
      byPage.set(item.page, bucket);
    }
    bucket.push(item);
  }

  const result: typeof parsed.textItems = [];
  for (const [, items] of [...byPage.entries()].sort(([a], [b]) => a - b)) {
    const reordered = detectAndReorderColumns(items, pageWidth);
    for (const item of reordered) {
      result.push(item);
    }
  }
  return result;
}
