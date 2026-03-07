import { describe, expect, it } from 'vitest';
import { summarizeManualReviewState, hasPendingManualReviewChanges, getNearbyTextSnippet } from '@/lib/report/manual-review';
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
  it('reports pending re-validation when persisted draft changes exist', () => {
    const file = makeFile({
      manualReviewDrafts: {
        altText: {
          'img-1-1': {
            alt: 'Campus accessibility map with accessible entrance marked in blue.',
            decorative: false
          }
        },
        structure: {
          includeHeadings: {},
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
