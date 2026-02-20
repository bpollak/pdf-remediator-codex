import type { ParsedPDF, TextItem } from '@/lib/pdf/types';
import { LIST_ITEM_PATTERN } from '@/lib/utils/patterns';

interface HeadingCandidate {
  text: string;
  level: number;
  page: number;
}

export interface DetectedTable {
  page: number;
  rows: Array<{
    cells: Array<{ text: string; x: number; y: number; isHeader: boolean }>;
  }>;
}

export interface ArtifactItem {
  text: string;
  page: number;
  x: number;
  y: number;
}

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
  if (LIST_ITEM_PATTERN.test(text)) return false;
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

/** Derive the most common text color in the document. */
function deriveBodyColor(parsed: ParsedPDF): string | undefined {
  const frequencies = new Map<string, number>();
  for (const item of parsed.textItems) {
    if (!item.color) continue;
    frequencies.set(item.color, (frequencies.get(item.color) ?? 0) + 1);
  }
  let mostCommon: string | undefined;
  let maxCount = 0;
  for (const [color, count] of frequencies.entries()) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = color;
    }
  }
  return mostCommon;
}

/** Weighted heading scoring: bold, font size, ALL CAPS, color, spacing. */
function headingScore(
  item: TextItem & { text: string },
  bodySize: number,
  bodyColor: string | undefined
): number {
  let score = 0;
  const appearsBold = item.bold || /bold|black|demi|semi/i.test(item.fontName);
  if (appearsBold) score += 2;
  if (item.fontSize >= bodySize + 1.5) score += 3;
  const trimmed = item.text.replace(/\s+/g, ' ').trim();
  if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && /[A-Z]/.test(trimmed)) score += 1.5;
  if (bodyColor && item.color && item.color !== bodyColor) score += 1;
  return score;
}

const HEADING_SCORE_THRESHOLD = 2;

export function detectHeadings(parsed: ParsedPDF): HeadingCandidate[] {
  const bodySize = deriveBodyFontSize(parsed);
  const bodyColor = deriveBodyColor(parsed);

  const candidateItems = parsed.textItems
    .filter((item) => {
      const text = cleanHeadingText(item.text);
      if (!looksLikeHeadingText(text)) return false;
      return headingScore({ ...item, text }, bodySize, bodyColor) >= HEADING_SCORE_THRESHOLD;
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
    .filter((item) => LIST_ITEM_PATTERN.test(item.text) && item.text.length <= 300)
    .map((item) => ({ text: item.text, page: item.page }));
}

export function detectParagraphs(parsed: ParsedPDF): Array<{ text: string; page: number }> {
  return parsed.textItems
    .map((item) => ({ ...item, text: item.text.replace(/\s+/g, ' ').trim() }))
    .filter((item) => item.text.length > 0 && !LIST_ITEM_PATTERN.test(item.text))
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)
    .slice(0, 600)
    .map((item) => ({ text: item.text, page: item.page }));
}

/**
 * Detect tabular data by analyzing aligned text positions.
 * Groups items into rows (shared y) and columns (shared x).
 */
export function detectTables(parsed: ParsedPDF): DetectedTable[] {
  const tables: DetectedTable[] = [];
  const Y_TOLERANCE = 3;
  const MIN_COLUMNS = 2;
  const MIN_ROWS = 2;

  for (let page = 1; page <= parsed.pageCount; page++) {
    const pageItems = parsed.textItems
      .filter((item) => item.page === page && item.text.trim().length > 0)
      .sort((a, b) => b.y - a.y || a.x - b.x);

    if (pageItems.length < MIN_ROWS * MIN_COLUMNS) continue;

    // Cluster items into rows by y-coordinate
    const rowBuckets = new Map<number, TextItem[]>();
    for (const item of pageItems) {
      const roundedY = Math.round(item.y / Y_TOLERANCE) * Y_TOLERANCE;
      let assigned = false;
      for (const [key, bucket] of rowBuckets) {
        if (Math.abs(key - roundedY) <= Y_TOLERANCE) {
          bucket.push(item);
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        rowBuckets.set(roundedY, [item]);
      }
    }

    // Keep only rows with multiple items
    const multiItemRows = [...rowBuckets.entries()]
      .filter(([, items]) => items.length >= MIN_COLUMNS)
      .sort(([y1], [y2]) => y2 - y1);

    if (multiItemRows.length < MIN_ROWS) continue;

    // Validate column alignment: items across rows should share x-positions
    const allXPositions = multiItemRows.flatMap(([, items]) => items.map((i) => Math.round(i.x)));
    const xClusters = clusterValues(allXPositions, 15);

    if (xClusters.length < MIN_COLUMNS) continue;

    // Build the table structure
    const rows = multiItemRows.map(([, items], rowIndex) => {
      const sortedCells = items
        .sort((a, b) => a.x - b.x)
        .map((item) => ({
          text: item.text.replace(/\s+/g, ' ').trim(),
          x: item.x,
          y: item.y,
          isHeader: rowIndex === 0 || !!(item.bold || /bold/i.test(item.fontName)),
        }));
      return { cells: sortedCells };
    });

    tables.push({ page, rows });
  }

  return tables;
}

/** Simple 1D clustering: group values within `tolerance` of each other. */
function clusterValues(values: number[], tolerance: number): number[] {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const centers: number[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]! - centers[centers.length - 1]! > tolerance) {
      centers.push(sorted[i]!);
    }
  }
  return centers;
}

/**
 * Detect artifacts: repeating headers/footers and page numbers.
 * Items appearing at the same (x, y) on 3+ pages are likely artifacts.
 */
export function detectArtifacts(parsed: ParsedPDF): ArtifactItem[] {
  if (parsed.pageCount < 3) return [];

  const POSITION_TOLERANCE = 5;
  const PAGE_NUMBER_PATTERN = /^(\d{1,4}|page\s+\d+(\s+of\s+\d+)?|[ivxlcdm]+)$/i;
  const MARGIN_TOP = 50;
  const MARGIN_BOTTOM = 50;

  // Group text items by approximate position
  const positionMap = new Map<string, Array<{ text: string; page: number; x: number; y: number }>>();

  for (const item of parsed.textItems) {
    const text = item.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;

    const roundedX = Math.round(item.x / POSITION_TOLERANCE) * POSITION_TOLERANCE;
    const roundedY = Math.round(item.y / POSITION_TOLERANCE) * POSITION_TOLERANCE;
    const key = `${roundedX}|${roundedY}`;

    let bucket = positionMap.get(key);
    if (!bucket) {
      bucket = [];
      positionMap.set(key, bucket);
    }
    bucket.push({ text, page: item.page, x: item.x, y: item.y });
  }

  const artifacts: ArtifactItem[] = [];
  const artifactKeys = new Set<string>();

  for (const [, items] of positionMap) {
    // Distinct pages where this position has text
    const distinctPages = new Set(items.map((i) => i.page));
    if (distinctPages.size < 3) continue;

    // Items at the same position across many pages are artifacts
    for (const item of items) {
      const key = `${item.page}|${item.x}|${item.y}`;
      if (artifactKeys.has(key)) continue;
      artifactKeys.add(key);
      artifacts.push(item);
    }
  }

  // Also flag page numbers in margins
  for (const item of parsed.textItems) {
    const text = item.text.replace(/\s+/g, ' ').trim();
    if (!PAGE_NUMBER_PATTERN.test(text)) continue;
    if (item.y <= MARGIN_BOTTOM || item.y >= 792 - MARGIN_TOP) {
      const key = `${item.page}|${item.x}|${item.y}`;
      if (artifactKeys.has(key)) continue;
      artifactKeys.add(key);
      artifacts.push({ text, page: item.page, x: item.x, y: item.y });
    }
  }

  return artifacts;
}

/**
 * Detect multi-column layouts and reorder text items so each column
 * is read top-to-bottom before moving to the next column.
 */
export function detectAndReorderColumns(items: TextItem[], pageWidth: number): TextItem[] {
  if (items.length < 4) return items;

  const xValues = items.map((i) => i.x);
  const xClusters = clusterValues(xValues, 30);

  if (xClusters.length < 2) return items; // single column

  // Check if the gap between cluster centers is significant
  const sortedClusters = xClusters.sort((a, b) => a - b);
  let maxGap = 0;
  let splitPoint = pageWidth / 2;
  for (let i = 1; i < sortedClusters.length; i++) {
    const gap = sortedClusters[i]! - sortedClusters[i - 1]!;
    if (gap > maxGap) {
      maxGap = gap;
      splitPoint = (sortedClusters[i - 1]! + sortedClusters[i]!) / 2;
    }
  }

  if (maxGap < pageWidth * 0.15) return items; // gap too small

  const leftItems = items.filter((i) => i.x < splitPoint);
  const rightItems = items.filter((i) => i.x >= splitPoint);

  if (leftItems.length === 0 || rightItems.length === 0) return items;

  const sortByReading = (a: TextItem, b: TextItem) => b.y - a.y || a.x - b.x;
  return [...leftItems.sort(sortByReading), ...rightItems.sort(sortByReading)];
}
