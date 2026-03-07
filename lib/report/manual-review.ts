import type { ParsedPDF } from '@/lib/pdf/types';
import { detectHeadings, detectTables } from '@/lib/remediate/heuristics';
import type {
  FileEntry,
  ManualAltTextDraft,
  ManualReviewDrafts,
  ManualStructureTableDecision
} from '@/types/file-entry';

function emptyDrafts(): ManualReviewDrafts {
  return {
    altText: {},
    structure: {
      includeHeadings: {},
      tableDecisions: {}
    }
  };
}

export function getManualReviewDrafts(file: FileEntry | undefined): ManualReviewDrafts {
  if (!file?.manualReviewDrafts) return emptyDrafts();
  return {
    altText: file.manualReviewDrafts.altText ?? {},
    structure: {
      includeHeadings: file.manualReviewDrafts.structure?.includeHeadings ?? {},
      tableDecisions: file.manualReviewDrafts.structure?.tableDecisions ?? {}
    },
    lastUpdatedAt: file.manualReviewDrafts.lastUpdatedAt
  };
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

export function getStructureTableDecision(
  file: FileEntry | undefined,
  key: string
): ManualStructureTableDecision {
  return getManualReviewDrafts(file).structure.tableDecisions[key] ?? 'review';
}

export function getStructureHeadingIncluded(file: FileEntry | undefined, key: string): boolean {
  return getManualReviewDrafts(file).structure.includeHeadings[key] ?? true;
}

export function hasPendingManualReviewChanges(file: FileEntry | undefined): boolean {
  if (!file?.manualReviewDrafts) return false;
  const drafts = getManualReviewDrafts(file);
  return (
    Object.keys(drafts.altText).length > 0 ||
    Object.keys(drafts.structure.includeHeadings).length > 0 ||
    Object.keys(drafts.structure.tableDecisions).length > 0
  );
}

export function summarizeManualReviewState(file: FileEntry | undefined) {
  const parsed = getParsedReviewBase(file);
  const drafts = getManualReviewDrafts(file);

  if (!parsed) {
    return {
      pendingRevalidation: false,
      altText: {
        totalImages: 0,
        missingCount: 0,
        completedCount: 0,
        editedCount: 0
      },
      structure: {
        headingSuggestions: 0,
        headingOverrides: 0,
        tableSuggestions: 0,
        reviewedTables: 0
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

  const headingSuggestions = detectHeadings(parsed);
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
      headingOverrides: Object.keys(drafts.structure.includeHeadings).length,
      tableSuggestions: tableSuggestions.length,
      reviewedTables
    },
    updatedAt: drafts.lastUpdatedAt
  };
}

export function getNearbyTextSnippet(parsed: ParsedPDF, input: { page: number; x: number; y: number; width: number; height: number }): string | undefined {
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
