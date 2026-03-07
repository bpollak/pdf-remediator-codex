import { describe, expect, it } from 'vitest';
import { resolveFindingPreviewFocus } from '@/lib/report/finding-focus';
import type { AuditFinding } from '@/lib/audit/types';
import type { FileEntry } from '@/types/file-entry';

function makeFile(): FileEntry {
  return {
    id: 'file-1',
    name: 'sample.pdf',
    size: 1024,
    uploadedBytes: new ArrayBuffer(8),
    status: 'remediated',
    progress: 100,
    parsedData: {
      pageCount: 1,
      metadata: {},
      hasStructTree: true,
      tags: [],
      textItems: [
        {
          text: 'click here',
          x: 100,
          y: 420,
          width: 60,
          height: 12,
          fontName: 'Helvetica',
          fontSize: 12,
          page: 1
        }
      ],
      images: [
        {
          id: 'img-1',
          page: 1,
          x: 40,
          y: 250,
          width: 120,
          height: 90
        }
      ],
      links: [
        {
          text: 'click here',
          url: 'https://example.com',
          page: 1
        }
      ],
      outlines: [],
      forms: []
    }
  };
}

function finding(overrides: Partial<AuditFinding>): AuditFinding {
  return {
    ruleId: 'IMG-001',
    category: 'Images & Non-Text Content',
    severity: 'critical',
    description: 'Image is missing alt text.',
    wcagCriterion: '1.1.1 Non-text Content',
    location: { page: 1, element: 'img-1' },
    recommendation: 'Provide meaningful alt text.',
    autoFixable: false,
    ...overrides
  };
}

describe('resolveFindingPreviewFocus', () => {
  it('returns exact image bounds for image findings', () => {
    const focus = resolveFindingPreviewFocus(makeFile(), finding({}), 'original');

    expect(focus?.page).toBe(1);
    expect(focus?.bounds?.width).toBeGreaterThan(120);
    expect(focus?.detail).toBe('Focused image region');
  });

  it('matches link text regions for link findings', () => {
    const focus = resolveFindingPreviewFocus(
      makeFile(),
      finding({
        ruleId: 'LNK-001',
        category: 'Links & Navigation',
        severity: 'major',
        description: 'Link text is not meaningful out of context.',
        location: { page: 1, element: 'click here' },
        recommendation: 'Use descriptive link text.'
      }),
      'original'
    );

    expect(focus?.page).toBe(1);
    expect(focus?.bounds?.x).toBeLessThanOrEqual(100);
    expect(focus?.detail).toBe('Matching link text region');
  });
});
