import type { ParsedPDF, TextItem } from '@/lib/pdf/types';
import { LIST_ITEM_PATTERN } from '@/lib/utils/patterns';

interface HeadingCandidate {
  text: string;
  level: number;
  page: number;
}

/** A heading together with the text item it came from (index into parsed.textItems). */
export interface HeadingItem extends HeadingCandidate {
  index: number;
  x: number;
  y: number;
  fontSize: number;
}

export interface ParagraphBlock {
  text: string;
  page: number;
  /** Index (into parsed.textItems) of the first line of the paragraph. */
  index: number;
  x: number;
  y: number;
  fontSize: number;
}

export interface DetectParagraphsOptions {
  /** Text item indices that belong to other roles (headings); they break paragraphs and are never merged in. */
  excludeIndices?: ReadonlySet<number>;
  /** Maximum number of paragraphs returned (default 400). */
  limit?: number;
}

const BULLET_PATTERN = /^[\u2022\-*]\s+/;

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

/**
 * Returns a function mapping source heading levels (in reading order) to
 * normalized levels with no skipped levels. A stack of (source level ->
 * normalized level) keeps siblings as siblings: H1 H3 H3 H3 becomes
 * H1 H2 H2 H2, not H1 H2 H3 H3. The first heading is always level 1.
 */
export function createHeadingLevelNormalizer(): (sourceLevel: number) => number {
  const stack: Array<{ source: number; normalized: number }> = [];

  return (sourceLevel: number) => {
    const source = Math.max(1, Math.min(6, Math.round(sourceLevel)));
    while (stack.length > 0 && stack[stack.length - 1]!.source > source) stack.pop();

    const top = stack[stack.length - 1];
    if (top && top.source === source) return top.normalized;

    const normalized = top ? Math.min(6, top.normalized + 1) : 1;
    stack.push({ source, normalized });
    return normalized;
  };
}

function normalizeHeadingLevels<T extends HeadingCandidate>(headings: T[]): T[] {
  const normalize = createHeadingLevelNormalizer();
  return headings.map((heading) => ({ ...heading, level: normalize(heading.level) }));
}

function cleanHeadingText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function looksLikeHeadingText(text: string, allowNumbered: boolean): boolean {
  if (!text || text.length > 110) return false;
  if (BULLET_PATTERN.test(text)) return false;
  // "1. Introduction" is a numbered heading when set clearly larger than
  // body text; at body size the same pattern is a list item.
  if (LIST_ITEM_PATTERN.test(text) && !allowNumbered) return false;
  if (/^[\d.\s]+$/.test(text)) return false;

  const alphaChars = (text.match(/[A-Za-z]/g) ?? []).length;
  if (alphaChars < 2) return false;

  return true;
}

function dedupeHeadings<T extends HeadingCandidate>(headings: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

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

function lineKey(page: number, y: number): string {
  return `${page}|${Math.round(y)}`;
}

/** Groups normalized item texts by (page, rounded baseline) so a line's neighbours can be found cheaply. */
function buildLineIndex(items: TextItem[]): Map<string, string[]> {
  const lines = new Map<string, string[]>();
  for (const item of items) {
    const text = cleanHeadingText(item.text);
    if (!text) continue;
    const key = lineKey(item.page, item.y);
    const bucket = lines.get(key);
    if (bucket) bucket.push(text);
    else lines.set(key, [text]);
  }
  return lines;
}

/**
 * True when no other text shares this item's baseline (within 1pt).
 * Identical overprinted copies (faux bold, duplicated runs) don't count.
 */
function isStandaloneLine(item: TextItem, text: string, lineIndex: Map<string, string[]>): boolean {
  const rounded = Math.round(item.y);
  for (let y = rounded - 1; y <= rounded + 1; y += 1) {
    const texts = lineIndex.get(`${item.page}|${y}`);
    if (texts?.some((other) => other !== text)) return false;
  }
  return true;
}

const STANDALONE_HEADING_MAX_LENGTH = 80;

/**
 * Weighted heading scoring: bold, font size, ALL CAPS, color. Bold only
 * counts together with a size increase or when the item is a short line of
 * its own, so an inline bold run ("Note:" followed by body text) is not a
 * heading.
 */
function headingScore(
  item: TextItem & { text: string },
  bodySize: number,
  bodyColor: string | undefined,
  standalone: boolean
): number {
  let score = 0;
  const larger = item.fontSize >= bodySize + 1.5;
  const standaloneShort = standalone && item.text.length <= STANDALONE_HEADING_MAX_LENGTH;
  const appearsBold = item.bold || /bold|black|demi|semi/i.test(item.fontName);
  if (appearsBold && (larger || standaloneShort)) score += 2;
  if (larger) score += 3;
  const trimmed = item.text.replace(/\s+/g, ' ').trim();
  if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && /[A-Z]/.test(trimmed)) score += 1.5;
  if (bodyColor && item.color && item.color !== bodyColor) score += 1;
  return score;
}

const HEADING_SCORE_THRESHOLD = 2;

function isClearlyLargerThanBody(fontSize: number, bodySize: number): boolean {
  return fontSize >= bodySize + 2 && fontSize >= bodySize * 1.2;
}

/** Stable page-only ordering: keeps the caller's (column-aware) order within a page. */
function indexedByPage<T extends { page: number }>(items: T[]): Array<{ item: T; index: number }> {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.page - b.item.page || a.index - b.index);
}

/**
 * Detects headings and returns them with the index of the text item they
 * came from, in the input's reading order (page, then the order of
 * parsed.textItems, which the extractor has already made column-aware).
 */
export function detectHeadingItems(parsed: ParsedPDF): HeadingItem[] {
  const bodySize = deriveBodyFontSize(parsed);
  const bodyColor = deriveBodyColor(parsed);
  const lineIndex = buildLineIndex(parsed.textItems);

  const candidates = indexedByPage(parsed.textItems)
    .map(({ item, index }) => ({ item, index, text: cleanHeadingText(item.text) }))
    .filter(({ item, text }) => {
      if (!looksLikeHeadingText(text, isClearlyLargerThanBody(item.fontSize, bodySize))) return false;
      return (
        headingScore({ ...item, text }, bodySize, bodyColor, isStandaloneLine(item, text, lineIndex)) >= HEADING_SCORE_THRESHOLD
      );
    });

  if (!candidates.length) return [];

  const rankedSizes = [...new Set(candidates.map(({ item }) => Math.round(item.fontSize * 10) / 10))]
    .sort((a, b) => b - a)
    .slice(0, 6);

  const ordered: HeadingItem[] = candidates.map(({ item, index, text }) => ({
    text,
    level: toHeadingLevel(Math.round(item.fontSize * 10) / 10, rankedSizes),
    page: item.page,
    index,
    x: item.x,
    y: item.y,
    fontSize: item.fontSize
  }));

  return normalizeHeadingLevels(dedupeHeadings(ordered));
}

export function detectHeadings(parsed: ParsedPDF): HeadingCandidate[] {
  return detectHeadingItems(parsed).map(({ text, level, page }) => ({ text, level, page }));
}

export interface ListItemBlock {
  text: string;
  page: number;
  index: number;
  x: number;
  y: number;
  fontSize: number;
}

export function detectListItems(
  parsed: ParsedPDF,
  options: { excludeIndices?: ReadonlySet<number> } = {}
): ListItemBlock[] {
  return indexedByPage(parsed.textItems)
    .filter(({ index }) => !options.excludeIndices?.has(index))
    .map(({ item, index }) => ({ item, index, text: item.text.replace(/\s+/g, ' ').trim() }))
    .filter(({ text }) => LIST_ITEM_PATTERN.test(text) && text.length <= 300)
    .map(({ item, index, text }) => ({ text, page: item.page, index, x: item.x, y: item.y, fontSize: item.fontSize }));
}

/**
 * Merges consecutive lines into paragraphs. Input order is preserved within
 * each page (the extractor has already ordered items by column), and items
 * listed in options.excludeIndices (headings) or matching the list pattern
 * end the current paragraph instead of being merged into it.
 */
export function detectParagraphs(parsed: ParsedPDF, options: DetectParagraphsOptions = {}): ParagraphBlock[] {
  const exclude = options.excludeIndices;
  const limit = options.limit ?? 400;
  const ordered = indexedByPage(parsed.textItems).map(({ item, index }) => ({
    ...item,
    index,
    text: item.text.replace(/\s+/g, ' ').trim()
  }));

  const paragraphs: ParagraphBlock[] = [];
  const MAX_PARAGRAPH_LENGTH = 900;
  const X_ALIGNMENT_TOLERANCE = 28;
  const MAX_LINE_GAP = 28;

  let first: (typeof ordered)[number] | null = null;
  let currentText = '';
  let previousItem: (typeof ordered)[number] | null = null;

  function flushParagraph() {
    const text = currentText.replace(/\s+/g, ' ').trim();
    if (text && first) {
      paragraphs.push({ text, page: first.page, index: first.index, x: first.x, y: first.y, fontSize: first.fontSize });
    }
    first = null;
    currentText = '';
    previousItem = null;
  }

  for (const item of ordered) {
    if (!item.text) continue;
    if (exclude?.has(item.index) || LIST_ITEM_PATTERN.test(item.text)) {
      flushParagraph();
      continue;
    }

    if (!previousItem) {
      first = item;
      currentText = item.text;
      previousItem = item;
      continue;
    }

    const samePage = item.page === previousItem.page;
    const yGap = previousItem.y - item.y;
    const sameColumn = Math.abs(item.x - previousItem.x) <= X_ALIGNMENT_TOLERANCE;
    const similarFont = Math.abs(item.fontSize - previousItem.fontSize) <= 2;
    const shouldMerge =
      samePage &&
      sameColumn &&
      similarFont &&
      yGap >= -1 &&
      yGap <= MAX_LINE_GAP &&
      currentText.length + item.text.length + 1 <= MAX_PARAGRAPH_LENGTH;

    if (!shouldMerge) {
      flushParagraph();
      first = item;
      currentText = item.text;
      previousItem = item;
      continue;
    }

    currentText = `${currentText} ${item.text}`;
    previousItem = item;
  }

  flushParagraph();
  return paragraphs.slice(0, limit);
}

/**
 * Detect tabular data by analyzing aligned text positions.
 * Groups items into rows (shared y) and columns (shared x).
 */
export function detectTables(parsed: ParsedPDF): DetectedTable[] {
  const tables: DetectedTable[] = [];
  const Y_TOLERANCE = 3;
  const X_TOLERANCE = 15;
  const COLUMN_MATCH_TOLERANCE = 22;
  const MIN_COLUMNS = 2;
  const MIN_ROWS = 3;
  const MAX_COLUMNS = 8;
  const MAX_AVG_CELL_LENGTH = 45;
  const LONG_CELL_LENGTH = 80;
  const MAX_LONG_CELL_RATIO = 0.35;
  const MIN_ALIGNED_ROW_RATIO = 0.75;

  for (let page = 1; page <= parsed.pageCount; page++) {
    const pageImageCount = parsed.images.filter((image) => image.page === page).length;
    const pageItems = parsed.textItems
      .filter((item) => item.page === page)
      .map((item) => ({ ...item, text: item.text.replace(/\s+/g, ' ').trim() }))
      .filter((item) => item.text.length > 0 && item.text.length <= 120)
      .sort((a, b) => b.y - a.y || a.x - b.x);

    if (pageItems.length < MIN_ROWS * MIN_COLUMNS) continue;
    // Infographic-like pages often contain many image draws and sparse/non-tabular text.
    // Avoid synthesizing table tags on those layouts.
    if (pageImageCount >= 4 && pageItems.length < 120) continue;

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
    const xClusters = clusterValues(allXPositions, X_TOLERANCE);

    if (xClusters.length < MIN_COLUMNS || xClusters.length > MAX_COLUMNS) continue;

    const alignedRows = multiItemRows
      .map(([y, items]) => {
        const withCluster = items
          .map((item) => ({ item, cluster: nearestClusterIndex(item.x, xClusters, COLUMN_MATCH_TOLERANCE) }))
          .filter((entry) => entry.cluster >= 0)
          .sort((a, b) => a.item.x - b.item.x);
        const distinctClusters = new Set(withCluster.map((entry) => entry.cluster));
        return {
          y,
          cells: withCluster.map((entry) => entry.item),
          distinctClusterCount: distinctClusters.size
        };
      })
      .filter((row) => row.distinctClusterCount >= MIN_COLUMNS);

    if (alignedRows.length < MIN_ROWS) continue;
    if (alignedRows.length / multiItemRows.length < MIN_ALIGNED_ROW_RATIO) continue;

    const allCellText = alignedRows.flatMap((row) => row.cells.map((cell) => cell.text));
    const avgCellLength = allCellText.reduce((sum, text) => sum + text.length, 0) / Math.max(1, allCellText.length);
    const longCellCount = allCellText.filter((text) => text.length >= LONG_CELL_LENGTH).length;
    const longCellRatio = longCellCount / Math.max(1, allCellText.length);
    if (avgCellLength > MAX_AVG_CELL_LENGTH || longCellRatio > MAX_LONG_CELL_RATIO) continue;

    const firstRowCells = alignedRows[0]!.cells;
    const hasHeaderSignal =
      firstRowCells.some((cell) => cell.bold || /bold|black|demi|semi/i.test(cell.fontName)) ||
      firstRowCells.every((cell) => cell.text.length <= 40);
    if (!hasHeaderSignal) continue;

    // Build the table structure
    const rows = alignedRows.map((row, rowIndex) => {
      const sortedCells = row.cells
        .sort((a, b) => a.x - b.x)
        .map((item) => ({
          text: item.text,
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

function nearestClusterIndex(value: number, clusters: number[], tolerance: number): number {
  if (!clusters.length) return -1;
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < clusters.length; index += 1) {
    const distance = Math.abs(value - clusters[index]!);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestDistance <= tolerance ? bestIndex : -1;
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
