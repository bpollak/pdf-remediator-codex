import type { ParsedPDF } from '@/lib/pdf/types';
import {
  detectHeadings,
  detectListItems,
  detectParagraphs,
  detectTables,
  detectArtifacts,
  detectAndReorderColumns,
  type DetectedTable,
  type ArtifactItem,
} from './heuristics';

export function extractRemediationPlan(parsed: ParsedPDF) {
  // Apply column reordering per page before detection passes
  const reorderedItems = reorderByColumns(parsed);
  const reorderedParsed = { ...parsed, textItems: reorderedItems };

  const headings = detectHeadings(reorderedParsed);
  const listItems = detectListItems(reorderedParsed);
  const paragraphs = detectParagraphs(reorderedParsed);
  const tables = detectTables(reorderedParsed);
  const artifacts = detectArtifacts(reorderedParsed);

  return {
    headings,
    listItems,
    paragraphs,
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
    result.push(...detectAndReorderColumns(items, pageWidth));
  }
  return result;
}
