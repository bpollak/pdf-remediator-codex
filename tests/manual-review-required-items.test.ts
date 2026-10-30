import { describe, expect, it } from 'vitest';
import type { AuditFinding } from '@/lib/audit/types';
import type { ParsedPDF } from '@/lib/pdf/types';
import {
  getRequiredChecklistItems,
  getReviewableImages,
  hasPendingManualReviewChanges,
  summarizeManualCompletion,
  type ChecklistWorkflowProgress
} from '@/lib/report/manual-review';
import type { FileEntry } from '@/types/file-entry';

function parsed(overrides: Partial<ParsedPDF> = {}): ParsedPDF {
  return {
    pageCount: 2,
    metadata: {},
    hasStructTree: true,
    tags: [],
    textItems: [],
    images: [],
    links: [],
    outlines: [],
    forms: [],
    ...overrides
  };
}

function finding(ruleId: string, overrides: Partial<AuditFinding> = {}): AuditFinding {
  return {
    ruleId,
    category: 'Document Structure',
    severity: 'major',
    description: `${ruleId} problem.`,
    wcagCriterion: '1.3.1',
    location: {},
    recommendation: 'Fix it.',
    autoFixable: false,
    ...overrides
  };
}

const fullPageScan = { id: 'scan-1', page: 1, x: 0, y: 0, width: 612, height: 792 };
const photo = { id: 'photo-1', page: 2, x: 72, y: 72, width: 120, height: 90 };

function makeFile(overrides: Partial<FileEntry> & { ocrCoverage?: { pagesProcessed: number; totalPages: number } } = {}): FileEntry {
  return {
    id: 'file-1',
    name: 'sample.pdf',
    size: 1024,
    status: 'remediated',
    progress: 100,
    remediatedParsedData: parsed(),
    postRemediationAudit: { score: 90, findings: [] },
    ...overrides
  } as FileEntry;
}

describe('required checklist items: OCR', () => {
  it('adds a required OCR item when a scan got no text', () => {
    const items = getRequiredChecklistItems(makeFile({ ocrAttempted: true, ocrApplied: false }));

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'ocr', title: 'Make the scanned text readable (OCR)', done: false });
    expect(items[0].detail).toContain("couldn't read any text");
  });

  it('says how many pages OCR covered when it only covered some', () => {
    const items = getRequiredChecklistItems(
      makeFile({ ocrAttempted: true, ocrApplied: true, ocrCoverage: { pagesProcessed: 3, totalPages: 10 } })
    );

    expect(items[0].id).toBe('ocr');
    expect(items[0].detail).toContain('3 of 10 pages');
  });

  it('adds no OCR item when OCR covered every page, or the file is not a scan', () => {
    expect(
      getRequiredChecklistItems(
        makeFile({ ocrAttempted: true, ocrApplied: true, ocrCoverage: { pagesProcessed: 2, totalPages: 2 } })
      )
    ).toEqual([]);
    expect(getRequiredChecklistItems(makeFile({ ocrAttempted: true, ocrApplied: true }))).toEqual([]);
    expect(getRequiredChecklistItems(makeFile())).toEqual([]);
  });

  it('keeps the OCR task open for an explicitly incomplete page', () => {
    const items = getRequiredChecklistItems(makeFile({ ocrAttempted: true, ocrApplied: true, ocrCoverage: { pagesProcessed: 2, totalPages: 2, incompletePages: [2] } } as Partial<FileEntry>));
    expect(items[0]).toMatchObject({ id: 'ocr', done: false });
    expect(items[0].detail).toContain('Review pages 2');
  });

  it('leaves the full-page scan image out of image descriptions, but keeps real photos', () => {
    const data = parsed({ images: [fullPageScan, photo] });
    const scan = makeFile({ ocrAttempted: true, ocrApplied: false, remediatedParsedData: data });
    const born = makeFile({ remediatedParsedData: data });

    expect(getReviewableImages(scan, data).map((image) => image.id)).toEqual(['photo-1']);
    expect(getReviewableImages(born, data).map((image) => image.id)).toEqual(['scan-1', 'photo-1']);
    // OCR item + the photo; the scan image is not counted.
    expect(summarizeManualCompletion(scan)).toMatchObject({ total: 2, altText: { total: 1 } });
  });
});

describe('required checklist items: remaining findings', () => {
  it('turns serious findings no other item covers into required items, once per rule', () => {
    const file = makeFile({
      postRemediationAudit: {
        score: 70,
        findings: [
          // A rule this code has never heard of (e.g. missing title) still becomes an item.
          finding('META-900', { category: 'Metadata & Navigation', description: 'Document title is missing.' }),
          finding('FRM-001', { category: 'Forms' }),
          finding('FRM-001', { category: 'Forms' }),
          finding('META-001', { severity: 'minor', category: 'Metadata & Navigation' })
        ]
      }
    });

    const items = getRequiredChecklistItems(file);
    expect(items.map((item) => [item.id, item.title])).toEqual([
      ['finding:META-900', 'Document title is missing'],
      ['finding:FRM-001', 'Label each form field']
    ]);
    expect(items[1].detail).toBe('Found in 2 places.');
    expect(items[0].instructions).toContain('File → Properties');
  });

  it('does not duplicate findings already covered by the structure, image or OCR items', () => {
    const file = makeFile({
      remediationMode: 'analysis-only',
      ocrAttempted: true,
      ocrApplied: false,
      remediatedParsedData: parsed({ images: [photo] }),
      postRemediationAudit: {
        score: 40,
        findings: [
          finding('DOC-002', { severity: 'critical' }),
          finding('DOC-004', { severity: 'critical' }),
          finding('HDG-001', { category: 'Headings & Structure' }),
          finding('IMG-001', { severity: 'critical', category: 'Images & Non-Text Content' }),
          finding('DOC-003')
        ]
      }
    });

    expect(getRequiredChecklistItems(file).map((item) => item.id)).toEqual(['ocr', 'finding:DOC-003']);
  });
});

describe('checklist progress maths', () => {
  const blocking = makeFile({
    remediationMode: 'analysis-only',
    postRemediationAudit: {
      score: 70,
      findings: [finding('DOC-003'), finding('FRM-001', { category: 'Forms' })]
    }
  });

  it('counts required items, so the meter cannot reach 100% while they are open', () => {
    expect(summarizeManualCompletion(blocking)).toMatchObject({
      total: 3,
      completed: 0,
      percent: 0,
      structure: { total: 1, completed: 0 },
      required: { total: 2, completed: 0 }
    });
  });

  it('counts ticked items and rounds down until everything is done', () => {
    const progress: ChecklistWorkflowProgress = {
      structureConfirmedAt: '2026-10-28T10:00:00.000Z',
      checklistItemsDoneAt: { 'finding:DOC-003': '2026-10-28T10:01:00.000Z' }
    };
    const twoOfThree = { ...blocking, workflowProgress: progress };
    expect(summarizeManualCompletion(twoOfThree)).toMatchObject({ total: 3, completed: 2, percent: 66 });

    const all = {
      ...blocking,
      workflowProgress: {
        ...progress,
        checklistItemsDoneAt: { ...progress.checklistItemsDoneAt, 'finding:FRM-001': '2026-10-28T10:02:00.000Z' }
      } as ChecklistWorkflowProgress
    };
    expect(summarizeManualCompletion(all)).toMatchObject({ total: 3, completed: 3, percent: 100 });
  });

  it('rounds 199 of 200 down to 99%', () => {
    const custom = Array.from({ length: 200 }, (_, index) => ({
      id: `c-${index}`,
      title: `Task ${index}`,
      category: 'other' as const,
      status: index === 0 ? ('todo' as const) : ('done' as const),
      createdAt: '2026-10-28T10:00:00.000Z',
      updatedAt: '2026-10-28T10:00:00.000Z'
    }));
    const file = makeFile({
      manualReviewDrafts: {
        altText: {},
        structure: { headings: {}, headingOrder: [], tableDecisions: {} },
        customElements: custom
      }
    });
    expect(summarizeManualCompletion(file)).toMatchObject({ total: 200, completed: 199, percent: 99 });
  });

  it('treats a ticked required item as a change that needs re-checking', () => {
    expect(hasPendingManualReviewChanges(blocking)).toBe(false);
    expect(
      hasPendingManualReviewChanges({
        ...blocking,
        workflowProgress: { checklistItemsDoneAt: { 'finding:DOC-003': 'x' } } as ChecklistWorkflowProgress
      })
    ).toBe(true);
  });
});
