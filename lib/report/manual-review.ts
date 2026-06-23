import type { ParsedPDF } from '@/lib/pdf/types';
import { detectHeadings, detectTables } from '@/lib/remediate/heuristics';
import type {
  FileEntry,
  ManualAltTextDraft,
  ManualCustomElementCategory,
  ManualCustomElementDraft,
  ManualReviewDrafts,
  ManualStructureHeadingDraft,
  ManualStructureTableDecision
} from '@/types/file-entry';

interface LegacyManualStructureDrafts {
  includeHeadings?: Record<string, boolean>;
  headings?: Record<string, ManualStructureHeadingDraft>;
  headingOrder?: string[];
  tableDecisions?: Record<string, ManualStructureTableDecision>;
}

interface LegacyManualReviewDrafts {
  altText?: Record<string, ManualAltTextDraft>;
  structure?: LegacyManualStructureDrafts;
  customElements?: ManualCustomElementDraft[];
  lastUpdatedAt?: string;
}

interface HeadingCandidateWithKey {
  key: string;
  text: string;
  level: number;
  page: number;
}

function emptyDrafts(): ManualReviewDrafts {
  return {
    altText: {},
    structure: {
      headings: {},
      headingOrder: [],
      tableDecisions: {}
    },
    customElements: []
  };
}

function clampHeadingLevel(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  const normalized = Math.round(value!);
  return Math.max(1, Math.min(6, normalized));
}

function normalizeHeadingDraft(
  draft: ManualStructureHeadingDraft | undefined,
  includeOverride?: boolean
): ManualStructureHeadingDraft | undefined {
  const normalized: ManualStructureHeadingDraft = {};
  const include = includeOverride ?? draft?.include;
  const level = clampHeadingLevel(draft?.level);

  if (include === false) normalized.include = false;
  if (level !== undefined) normalized.level = level;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function uniqueStrings(values: string[] | undefined): string[] {
  if (!values) return [];
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    ordered.push(value);
  }

  return ordered;
}

const customElementCategories = new Set<ManualCustomElementCategory>([
  'alt-text',
  'structure',
  'reading-order',
  'table',
  'form-field',
  'metadata',
  'other'
]);

function normalizeCustomElements(values: ManualCustomElementDraft[] | undefined): ManualCustomElementDraft[] {
  if (!Array.isArray(values)) return [];

  const seen = new Set<string>();
  const normalized: ManualCustomElementDraft[] = [];

  for (const value of values) {
    if (!value || typeof value.id !== 'string' || seen.has(value.id)) continue;

    const title = typeof value.title === 'string' ? value.title.trim() : '';
    if (!title) continue;

    const category = customElementCategories.has(value.category) ? value.category : 'other';
    const status = value.status === 'done' ? 'done' : 'todo';
    const createdAt = typeof value.createdAt === 'string' && value.createdAt ? value.createdAt : value.updatedAt;
    const updatedAt = typeof value.updatedAt === 'string' && value.updatedAt ? value.updatedAt : createdAt;
    const note = typeof value.note === 'string' ? value.note.trim() : '';
    const completedAt =
      status === 'done' && typeof value.completedAt === 'string' && value.completedAt
        ? value.completedAt
        : undefined;

    seen.add(value.id);
    normalized.push({
      id: value.id,
      title,
      category,
      status,
      createdAt: createdAt || updatedAt || '',
      updatedAt: updatedAt || createdAt || '',
      ...(note ? { note } : {}),
      ...(completedAt ? { completedAt } : {})
    });
  }

  return normalized;
}

export function normalizeManualReviewDrafts(
  drafts: ManualReviewDrafts | LegacyManualReviewDrafts | undefined
): ManualReviewDrafts | undefined {
  if (!drafts) return undefined;

  const structure = (drafts.structure ?? {}) as Partial<ManualReviewDrafts['structure']> &
    LegacyManualStructureDrafts;
  const altText = Object.fromEntries(
    Object.entries(drafts.altText ?? {}).filter(([, value]) => Boolean(value))
  ) as Record<string, ManualAltTextDraft>;
  const headings: Record<string, ManualStructureHeadingDraft> = {};

  for (const [key, value] of Object.entries(structure.headings ?? {})) {
    const normalized = normalizeHeadingDraft(value);
    if (normalized) headings[key] = normalized;
  }

  for (const [key, include] of Object.entries(structure.includeHeadings ?? {})) {
    const normalized = normalizeHeadingDraft(headings[key], include);
    if (normalized) headings[key] = normalized;
  }

  const tableDecisions = Object.fromEntries(
    Object.entries(structure.tableDecisions ?? {}).filter(
      ([, value]) => value === 'confirm' || value === 'reject'
    )
  ) as Record<string, ManualStructureTableDecision>;
  const headingOrder = uniqueStrings(structure.headingOrder);
  const customElements = normalizeCustomElements(drafts.customElements);

  if (
    Object.keys(altText).length === 0 &&
    Object.keys(headings).length === 0 &&
    headingOrder.length === 0 &&
    Object.keys(tableDecisions).length === 0 &&
    customElements.length === 0
  ) {
    return undefined;
  }

  return {
    altText,
    structure: {
      headings,
      headingOrder,
      tableDecisions
    },
    customElements,
    lastUpdatedAt: drafts.lastUpdatedAt
  };
}

export function getManualReviewDrafts(file: FileEntry | undefined): ManualReviewDrafts {
  return normalizeManualReviewDrafts(file?.manualReviewDrafts) ?? emptyDrafts();
}

export function getParsedReviewBase(file: FileEntry | undefined): ParsedPDF | undefined {
  return file?.remediatedParsedData ?? file?.parsedData;
}

export function getAltTextDraftForImage(
  file: FileEntry | undefined,
  image: { id: string; alt?: string; decorative?: boolean }
): ManualAltTextDraft {
  const drafts = getManualReviewDrafts(file).altText;
  return drafts[image.id] ?? { alt: image.alt ?? '', decorative: Boolean(image.decorative) };
}

export function getHeadingDraftKey(heading: { page: number; level: number }, index: number): string {
  return `h-${index}-${heading.page}-${heading.level}`;
}

export function getTableDraftKey(table: { page: number }, index: number): string {
  return `t-${index}-${table.page}`;
}

function getHeadingCandidates(parsed: ParsedPDF): HeadingCandidateWithKey[] {
  return detectHeadings(parsed).map((heading, index) => ({
    ...heading,
    key: getHeadingDraftKey(heading, index)
  }));
}

function getHeadingMap(parsed: ParsedPDF): Map<string, HeadingCandidateWithKey> {
  return new Map(getHeadingCandidates(parsed).map((heading) => [heading.key, heading]));
}

function normalizeHeadingOrderWithKeys(headingKeys: string[], storedOrder: string[]): string[] {
  const includedKeys = new Set(headingKeys);
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const key of storedOrder) {
    if (!includedKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    ordered.push(key);
  }

  for (const key of headingKeys) {
    if (seen.has(key)) continue;
    ordered.push(key);
  }

  return ordered;
}

function hasCustomHeadingOrder(headingKeys: string[], storedOrder: string[]): boolean {
  if (headingKeys.length === 0 || storedOrder.length === 0) return false;
  const normalized = normalizeHeadingOrderWithKeys(headingKeys, storedOrder);
  return normalized.some((key, index) => key !== headingKeys[index]);
}

function hasHeadingDraftChanges(file: FileEntry | undefined): boolean {
  const parsed = getParsedReviewBase(file);
  const drafts = getManualReviewDrafts(file);

  if (!parsed) {
    return Object.keys(drafts.structure.headings).length > 0 || drafts.structure.headingOrder.length > 0;
  }

  const headingMap = getHeadingMap(parsed);
  for (const [key, draft] of Object.entries(drafts.structure.headings)) {
    const detected = headingMap.get(key);
    if (!detected) {
      if (draft.include === false || draft.level !== undefined) return true;
      continue;
    }

    if (draft.include === false) return true;
    if (draft.level !== undefined && draft.level !== detected.level) return true;
  }

  return hasCustomHeadingOrder(
    Array.from(headingMap.keys()),
    drafts.structure.headingOrder
  );
}

export function getStructureTableDecision(
  file: FileEntry | undefined,
  key: string
): ManualStructureTableDecision {
  return getManualReviewDrafts(file).structure.tableDecisions[key] ?? 'review';
}

export function getStructureHeadingDraft(
  file: FileEntry | undefined,
  key: string
): ManualStructureHeadingDraft | undefined {
  return getManualReviewDrafts(file).structure.headings[key];
}

export function getStructureHeadingIncluded(file: FileEntry | undefined, key: string): boolean {
  return getStructureHeadingDraft(file, key)?.include ?? true;
}

export function getStructureHeadingLevel(
  file: FileEntry | undefined,
  key: string,
  detectedLevel: number
): number {
  return getStructureHeadingDraft(file, key)?.level ?? detectedLevel;
}

export function getOrderedStructureHeadingKeys(
  file: FileEntry | undefined,
  headingKeys: string[]
): string[] {
  return normalizeHeadingOrderWithKeys(
    headingKeys,
    getManualReviewDrafts(file).structure.headingOrder
  );
}

export function hasPendingManualReviewChanges(file: FileEntry | undefined): boolean {
  if (!file) return false;
  if (!file.manualReviewDrafts) return Boolean(file.workflowProgress?.structurePreparedAt);
  const drafts = getManualReviewDrafts(file);
  return (
    Object.keys(drafts.altText).length > 0 ||
    hasHeadingDraftChanges(file) ||
    Object.keys(drafts.structure.tableDecisions).length > 0 ||
    drafts.customElements.length > 0 ||
    Boolean(file.workflowProgress?.structurePreparedAt)
  );
}

export function summarizeManualReviewState(file: FileEntry | undefined) {
  const parsed = getParsedReviewBase(file);
  const drafts = getManualReviewDrafts(file);

  if (!parsed) {
    return {
      pendingRevalidation: hasPendingManualReviewChanges(file),
      altText: {
        totalImages: 0,
        missingCount: 0,
        completedCount: 0,
        editedCount: 0
      },
      structure: {
        headingSuggestions: 0,
        headingOverrides: 0,
        headingOrderCustomized: false,
        tableSuggestions: 0,
        reviewedTables: 0
      },
      customElements: {
        totalCount: drafts.customElements.length,
        completedCount: drafts.customElements.filter((item) => item.status === 'done').length
      },
      updatedAt: drafts.lastUpdatedAt
    };
  }

  const images = parsed.images;
  const altEditedCount = Object.keys(drafts.altText).length;
  const missingCount = images.filter((image) => {
    const draft = drafts.altText[image.id] ?? { alt: image.alt ?? '', decorative: Boolean(image.decorative) };
    return !draft.decorative && draft.alt.trim().length === 0;
  }).length;

  const headingSuggestions = getHeadingCandidates(parsed);
  const headingKeys = headingSuggestions.map((heading) => heading.key);
  const headingOverrides = headingSuggestions.filter((heading) => {
    const draft = drafts.structure.headings[heading.key];
    if (!draft) return false;
    return draft.include === false || (draft.level !== undefined && draft.level !== heading.level);
  }).length;
  const headingOrderCustomized = hasCustomHeadingOrder(headingKeys, drafts.structure.headingOrder);
  const tableSuggestions = detectTables(parsed);
  const reviewedTables = tableSuggestions.filter((table, index) => {
    const key = getTableDraftKey(table, index);
    return (drafts.structure.tableDecisions[key] ?? 'review') !== 'review';
  }).length;

  return {
    pendingRevalidation: hasPendingManualReviewChanges(file),
    altText: {
      totalImages: images.length,
      missingCount,
      completedCount: images.length - missingCount,
      editedCount: altEditedCount
    },
    structure: {
      headingSuggestions: headingSuggestions.length,
      headingOverrides: headingOverrides + (headingOrderCustomized ? 1 : 0),
      headingOrderCustomized,
      tableSuggestions: tableSuggestions.length,
      reviewedTables
    },
    customElements: {
      totalCount: drafts.customElements.length,
      completedCount: drafts.customElements.filter((item) => item.status === 'done').length
    },
    updatedAt: drafts.lastUpdatedAt
  };
}

export function summarizeManualCompletion(file: FileEntry | undefined) {
  const review = summarizeManualReviewState(file);
  const altTextTotal = review.altText.totalImages;
  const altTextCompleted = review.altText.completedCount;
  const manualStructureTotal = file?.remediationMode === 'analysis-only' ? 1 : 0;
  const manualStructureCompleted =
    manualStructureTotal > 0 && file?.workflowProgress?.structurePreparedAt ? 1 : 0;
  const tableTotal = review.structure.tableSuggestions;
  const tableCompleted = review.structure.reviewedTables;
  const customTotal = review.customElements.totalCount;
  const customCompleted = review.customElements.completedCount;
  const total = altTextTotal + manualStructureTotal + tableTotal + customTotal;
  const completed = altTextCompleted + manualStructureCompleted + tableCompleted + customCompleted;

  return {
    total,
    completed,
    percent: total === 0 ? 100 : Math.round((completed / total) * 100),
    altText: {
      total: altTextTotal,
      completed: altTextCompleted
    },
    tables: {
      total: tableTotal,
      completed: tableCompleted
    },
    structure: {
      total: manualStructureTotal,
      completed: manualStructureCompleted
    },
    customElements: {
      total: customTotal,
      completed: customCompleted
    }
  };
}

export function buildStructurePlanHeadings(
  file: FileEntry | undefined,
  detectedHeadings: Array<{ page: number; level: number; text: string }>
) {
  const keyed = detectedHeadings.map((heading, index) => ({
    key: getHeadingDraftKey(heading, index),
    ...heading
  }));
  const orderedKeys = getOrderedStructureHeadingKeys(
    file,
    keyed.map((heading) => heading.key)
  );
  const keyedMap = new Map(keyed.map((heading) => [heading.key, heading]));

  return orderedKeys
    .map((key) => {
      const heading = keyedMap.get(key);
      if (!heading) return undefined;
      return {
        ...heading,
        includeInBookmarkPlan: getStructureHeadingIncluded(file, key),
        editedLevel: getStructureHeadingLevel(file, key, heading.level)
      };
    })
    .filter((heading): heading is NonNullable<typeof heading> => Boolean(heading));
}

export function getNearbyTextSnippet(
  parsed: ParsedPDF,
  input: { page: number; x: number; y: number; width: number; height: number }
): string | undefined {
  const centerX = input.x + input.width / 2;
  const centerY = input.y + input.height / 2;

  const nearbyItems = parsed.textItems
    .filter((item) => item.page === input.page)
    .map((item) => {
      const itemCenterX = item.x + item.width / 2;
      const itemCenterY = item.y + item.height / 2;
      const dx = Math.abs(itemCenterX - centerX);
      const dy = Math.abs(itemCenterY - centerY);
      const withinBand =
        item.x + item.width >= input.x - 160 &&
        item.x <= input.x + input.width + 160 &&
        item.y + item.height >= input.y - 120 &&
        item.y <= input.y + input.height + 120;

      return {
        ...item,
        distance: dx + dy,
        withinBand
      };
    })
    .filter((item) => item.withinBand)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 8)
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map((item) => item.text.replace(/\s+/g, ' ').trim())
    .filter((text) => text.length > 0);

  if (!nearbyItems.length) return undefined;
  const snippet = nearbyItems.join(' ').replace(/\s+/g, ' ').trim();
  return snippet.length > 220 ? `${snippet.slice(0, 217).trimEnd()}...` : snippet;
}
