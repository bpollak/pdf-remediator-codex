import { describe, expect, it } from 'vitest';
import {
  getNearbyTextSnippet,
  hasPendingManualReviewChanges,
  normalizeManualReviewDrafts,
  summarizeManualReviewState
} from '@/lib/report/manual-review';
import type { FileEntry } from '@/stores/app-store';

function makeFile(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    id: 'file-1',
    name: 'sample.pdf',
    size: 1024,
    uploadedBytes: new ArrayBuffer(8),
    status: 'remediated',
    progress: 100,
    remediatedParsedData: {
      pageCount: 1,
      metadata: {},
      hasStructTree: true,
      tags: [],
      textItems: [
        {
          text: 'Campus Accessibility Guide',
          x: 40,
          y: 700,
          width: 200,
          height: 12,
          fontName: 'Helvetica-Bold',
          fontSize: 18,
          bold: true,
          page: 1
        },
        {
          text: 'Getting There',
          x: 40,
          y: 650,
          width: 150,
          height: 12,
          fontName: 'Helvetica-Bold',
          fontSize: 16,
          bold: true,
          page: 1
        },
        {
          text: 'Entrance Details',
          x: 40,
          y: 610,
          width: 150,
          height: 12,
          fontName: 'Helvetica-Bold',
          fontSize: 14,
          bold: true,
          page: 1
        },
        {
          text: 'Figure 1. Campus accessibility map',
          x: 40,
          y: 520,
          width: 180,
          height: 12,
          fontName: 'Helvetica',
          fontSize: 12,
          page: 1
        },
        {
          text: 'Blue route shows the accessible entrance.',
          x: 40,
          y: 500,
          width: 220,
          height: 12,
          fontName: 'Helvetica',
          fontSize: 12,
          page: 1
        }
      ],
      images: [
        {
          id: 'img-1-1',
          page: 1,
          x: 60,
          y: 360,
          width: 180,
          height: 120
        }
      ],
      links: [],
      outlines: [],
      forms: []
    },
    ...overrides
  };
}

describe('manual review utilities', () => {
  it('reports pending re-validation when persisted alt-text draft changes exist', () => {
    const file = makeFile({
      manualReviewDrafts: {
        altText: {
          'img-1-1': {
            alt: 'Campus accessibility map with accessible entrance marked in blue.',
            decorative: false
          }
        },
        structure: {
          headings: {},
          headingOrder: [],
          tableDecisions: {}
        },
        lastUpdatedAt: '2026-03-06T10:00:00.000Z'
      }
    });

    expect(hasPendingManualReviewChanges(file)).toBe(true);

    const summary = summarizeManualReviewState(file);
    expect(summary.pendingRevalidation).toBe(true);
    expect(summary.altText.completedCount).toBe(1);
    expect(summary.altText.missingCount).toBe(0);
  });

  it('treats heading level edits as pending structure changes', () => {
    const file = makeFile({
      manualReviewDrafts: {
        altText: {},
        structure: {
          headings: {
            'h-1-1-2': {
              level: 1
            }
          },
          headingOrder: [],
          tableDecisions: {}
        },
        lastUpdatedAt: '2026-03-06T10:00:00.000Z'
      }
    });

    const summary = summarizeManualReviewState(file);

    expect(hasPendingManualReviewChanges(file)).toBe(true);
    expect(summary.structure.headingSuggestions).toBe(3);
    expect(summary.structure.headingOverrides).toBe(1);
  });

  it('treats custom heading order as a pending structure change', () => {
    const file = makeFile({
      manualReviewDrafts: {
        altText: {},
        structure: {
          headings: {},
          headingOrder: ['h-1-1-2', 'h-0-1-1', 'h-2-1-3'],
          tableDecisions: {}
        },
        lastUpdatedAt: '2026-03-06T10:00:00.000Z'
      }
    });

    const summary = summarizeManualReviewState(file);

    expect(hasPendingManualReviewChanges(file)).toBe(true);
    expect(summary.structure.headingOrderCustomized).toBe(true);
    expect(summary.structure.headingOverrides).toBe(1);
  });

  it('normalizes legacy includeHeadings drafts into the new structure shape', () => {
    const normalized = normalizeManualReviewDrafts({
      altText: {},
      structure: {
        includeHeadings: {
          'h-1-1-2': false
        },
        tableDecisions: {}
      },
      lastUpdatedAt: '2026-03-06T10:00:00.000Z'
    });

    expect(normalized).toEqual({
      altText: {},
      structure: {
        headings: {
          'h-1-1-2': {
            include: false
          }
        },
        headingOrder: [],
        tableDecisions: {}
      },
      lastUpdatedAt: '2026-03-06T10:00:00.000Z'
    });
  });

  it('reports no pending re-validation when no draft overrides exist', () => {
    const summary = summarizeManualReviewState(makeFile());

    expect(summary.pendingRevalidation).toBe(false);
    expect(summary.altText.missingCount).toBe(1);
  });

  it('derives nearby text around an image region', () => {
    const file = makeFile();
    const snippet = getNearbyTextSnippet(file.remediatedParsedData!, {
      page: 1,
      x: 60,
      y: 360,
      width: 180,
      height: 120
    });

    expect(snippet).toContain('Campus accessibility map');
  });
});
