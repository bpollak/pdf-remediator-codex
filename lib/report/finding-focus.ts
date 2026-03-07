import type { AuditFinding } from '@/lib/audit/types';
import type { ParsedPDF, TextItem } from '@/lib/pdf/types';
import { detectHeadings, detectListItems, detectTables } from '@/lib/remediate/heuristics';
import type { FileEntry } from '@/types/file-entry';

export interface FindingPreviewFocus {
  page: number;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  detail?: string;
}

function getParsedForVariant(
  file: FileEntry | undefined,
  variant: 'original' | 'remediated'
): ParsedPDF | undefined {
  if (!file) return undefined;
  if (variant === 'remediated') return file.remediatedParsedData ?? file.parsedData;
  return file.parsedData ?? file.remediatedParsedData;
}

function normalizeText(value: string | undefined): string {
  return value?.replace(/\s+/g, ' ').trim().toLowerCase() ?? '';
}

function inflateBounds(bounds: { x: number; y: number; width: number; height: number }, padding = 18) {
  return {
    x: Math.max(0, bounds.x - padding),
    y: Math.max(0, bounds.y - padding),
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2
  };
}

function boundsFromTextItems(items: TextItem[]) {
  const minX = Math.min(...items.map((item) => item.x));
  const minY = Math.min(...items.map((item) => item.y));
  const maxX = Math.max(...items.map((item) => item.x + item.width));
  const maxY = Math.max(...items.map((item) => item.y + item.height));

  return inflateBounds({
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  });
}

function matchTextItems(parsed: ParsedPDF, page: number | undefined, targetText: string | undefined): TextItem[] {
  const normalizedTarget = normalizeText(targetText);
  if (!normalizedTarget) return [];

  const candidates = parsed.textItems.filter((item) => (page ? item.page === page : true));
  const exact = candidates.filter((item) => normalizeText(item.text) === normalizedTarget);
  if (exact.length > 0) return exact;

  const inclusive = candidates.filter((item) => {
    const normalizedItem = normalizeText(item.text);
    return normalizedItem.includes(normalizedTarget) || normalizedTarget.includes(normalizedItem);
  });

  return inclusive.slice(0, 3);
}

function resolveImageFocus(parsed: ParsedPDF, finding: AuditFinding): FindingPreviewFocus | undefined {
  const image = parsed.images.find((candidate) => candidate.id === finding.location.element);
  if (!image) return undefined;

  return {
    page: image.page,
    bounds: inflateBounds({
      x: image.x,
      y: image.y,
      width: image.width,
      height: image.height
    }),
    detail: 'Focused image region'
  };
}

function resolveTextMatchFocus(parsed: ParsedPDF, finding: AuditFinding, detail: string): FindingPreviewFocus | undefined {
  const items = matchTextItems(parsed, finding.location.page, finding.location.element);
  if (items.length === 0) return undefined;

  return {
    page: items[0]!.page,
    bounds: boundsFromTextItems(items),
    detail
  };
}

function resolveHeadingFocus(parsed: ParsedPDF): FindingPreviewFocus | undefined {
  const heading = detectHeadings(parsed)[0];
  if (!heading) return undefined;
  const items = matchTextItems(parsed, heading.page, heading.text);
  if (items.length === 0) {
    return {
      page: heading.page,
      detail: 'Approximate heading candidate page'
    };
  }

  return {
    page: heading.page,
    bounds: boundsFromTextItems(items),
    detail: 'Detected heading candidate'
  };
}

function resolveListFocus(parsed: ParsedPDF): FindingPreviewFocus | undefined {
  const listItem = detectListItems(parsed)[0];
  if (!listItem) return undefined;
  const items = matchTextItems(parsed, listItem.page, listItem.text);
  if (items.length === 0) {
    return {
      page: listItem.page,
      detail: 'Approximate list-like text page'
    };
  }

  return {
    page: listItem.page,
    bounds: boundsFromTextItems(items),
    detail: 'Detected list-like text'
  };
}

function resolveColorFocus(parsed: ParsedPDF, page: number | undefined): FindingPreviewFocus | undefined {
  const item = parsed.textItems.find((candidate) => candidate.color && (page ? candidate.page === page : true));
  if (!item) return undefined;

  return {
    page: item.page,
    bounds: inflateBounds({
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height
    }),
    detail: 'Sample text region for visual review'
  };
}

function resolveTableFocus(parsed: ParsedPDF, page: number | undefined): FindingPreviewFocus | undefined {
  const table = detectTables(parsed).find((candidate) => (page ? candidate.page === page : true));
  if (!table) return undefined;

  const textMatches = table.rows.flatMap((row) =>
    row.cells.flatMap((cell) =>
      parsed.textItems.filter(
        (item) =>
          item.page === table.page &&
          normalizeText(item.text) === normalizeText(cell.text) &&
          Math.abs(item.x - cell.x) <= 24 &&
          Math.abs(item.y - cell.y) <= 8
      )
    )
  );

  if (textMatches.length > 0) {
    return {
      page: table.page,
      bounds: boundsFromTextItems(textMatches),
      detail: 'Detected table region'
    };
  }

  const minX = Math.min(...table.rows.flatMap((row) => row.cells.map((cell) => cell.x)));
  const maxX = Math.max(...table.rows.flatMap((row) => row.cells.map((cell) => cell.x)));
  const minY = Math.min(...table.rows.flatMap((row) => row.cells.map((cell) => cell.y)));
  const maxY = Math.max(...table.rows.flatMap((row) => row.cells.map((cell) => cell.y)));

  return {
    page: table.page,
    bounds: inflateBounds({
      x: minX,
      y: minY - 24,
      width: Math.max(160, maxX - minX + 180),
      height: Math.max(80, maxY - minY + 56)
    }),
    detail: 'Approximate table region'
  };
}

export function resolveFindingPreviewFocus(
  file: FileEntry | undefined,
  finding: AuditFinding,
  variant: 'original' | 'remediated'
): FindingPreviewFocus | undefined {
  const parsed = getParsedForVariant(file, variant);
  if (!parsed) return undefined;

  if (finding.ruleId === 'IMG-001' || finding.ruleId === 'IMG-002') {
    return resolveImageFocus(parsed, finding);
  }
  if (finding.ruleId === 'LNK-001') {
    return resolveTextMatchFocus(parsed, finding, 'Matching link text region');
  }
  if (finding.ruleId === 'HDG-001' || finding.ruleId === 'HDG-002') {
    return resolveHeadingFocus(parsed);
  }
  if (finding.ruleId === 'TBL-001' || finding.ruleId === 'TBL-002') {
    return resolveTableFocus(parsed, finding.location.page);
  }
  if (finding.ruleId === 'LST-001') {
    return resolveListFocus(parsed);
  }
  if (finding.ruleId === 'CLR-001') {
    return resolveColorFocus(parsed, finding.location.page);
  }

  const page = finding.location.page ?? 1;
  return {
    page,
    detail: finding.location.element ? `Focused using ${finding.location.element}` : 'Focused page'
  };
}
