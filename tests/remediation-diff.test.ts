import { describe, expect, it } from 'vitest';
import type { AuditFinding, AuditResult } from '@/lib/audit/types';
import type { FileEntry } from '@/types/file-entry';
import {
  summarizeAutomaticFixes,
  summarizeFileChanges,
  summarizeNotChecked,
  summarizeRemainingIssues
} from '@/lib/report/remediation-diff';

function finding(ruleId: string, overrides: Partial<AuditFinding> = {}): AuditFinding {
  return {
    ruleId,
    category: 'Document Structure',
    severity: 'major',
    description: `${ruleId} problem.`,
    wcagCriterion: '1.3.1',
    location: {},
    recommendation: 'Fix it.',
    autoFixable: true,
    ...overrides
  };
}

function audit(findings: AuditFinding[], notChecked?: string[]): AuditResult {
  return { score: 50, findings, ...(notChecked ? { notChecked } : {}) };
}

describe('summarizeAutomaticFixes', () => {
  it('lists problems the automatic pass removed, in plain words, worst first', () => {
    const original = audit([
      finding('META-001', { severity: 'minor', category: 'Metadata & Navigation' }),
      finding('DOC-003'),
      finding('LNK-001', { category: 'Links & Navigation' }),
      finding('LNK-001', { category: 'Links & Navigation' }),
      finding('IMG-001', { severity: 'critical', category: 'Images & Non-Text Content' })
    ]);
    const remediated = audit([finding('IMG-001', { severity: 'critical', category: 'Images & Non-Text Content' })]);

    expect(summarizeAutomaticFixes(original, remediated)).toEqual([
      { ruleId: 'LNK-001', label: 'Rewrote unclear link text', fixedCount: 2, partial: false },
      { ruleId: 'DOC-003', label: 'Set the document language', fixedCount: 1, partial: false },
      { ruleId: 'META-001', label: 'Added a document subject', fixedCount: 1, partial: false }
    ]);
  });

  it('marks a rule as partly fixed when some instances are left', () => {
    const original = audit([finding('FRM-001'), finding('FRM-001'), finding('FRM-001')]);
    const remediated = audit([finding('FRM-001')]);

    expect(summarizeAutomaticFixes(original, remediated)).toEqual([
      { ruleId: 'FRM-001', label: 'Labeled form fields', fixedCount: 2, partial: true }
    ]);
  });

  it('never claims tags were added for an analysis-only result', () => {
    const original = audit([finding('DOC-002', { severity: 'critical' }), finding('META-002'), finding('DOC-003')]);
    const remediated = audit([]);

    const fixed = summarizeAutomaticFixes(original, remediated, { analysisOnly: true });
    expect(fixed.map((item) => item.ruleId)).toEqual(['DOC-003']);
  });

  it('describes unknown rules by category', () => {
    const fixed = summarizeAutomaticFixes(
      audit([finding('NEW-123', { category: 'Metadata & Navigation' })]),
      audit([])
    );
    expect(fixed[0].label).toBe('Fixed a document details problem');
  });

  it('returns nothing without both audits', () => {
    expect(summarizeAutomaticFixes(undefined, audit([]))).toEqual([]);
    expect(summarizeAutomaticFixes(audit([finding('DOC-003')]), undefined)).toEqual([]);
  });
});

describe('summarizeRemainingIssues', () => {
  it('groups findings by rule with their pages, worst first', () => {
    const remaining = summarizeRemainingIssues(
      audit([
        finding('LNK-002', { severity: 'minor', category: 'Links & Navigation' }),
        finding('IMG-001', { severity: 'critical', category: 'Images & Non-Text Content', location: { page: 3 } }),
        finding('IMG-001', { severity: 'critical', category: 'Images & Non-Text Content', location: { page: 1 } })
      ])
    );

    expect(remaining.map((item) => [item.ruleId, item.title, item.count, item.pages])).toEqual([
      ['IMG-001', 'Describe each meaningful image', 2, [1, 3]],
      ['LNK-002', 'Add bookmarks', 1, []]
    ]);
  });

  it("uses an unknown rule's own description as its title", () => {
    const [item] = summarizeRemainingIssues(
      audit([finding('META-777', { category: 'Metadata & Navigation', description: 'Document title is missing.' })])
    );
    expect(item.title).toBe('Document title is missing');
    expect(item.howTo).toContain('File → Properties');
  });
});

describe('summarizeNotChecked', () => {
  it('names checks that could not run, without duplicates', () => {
    expect(summarizeNotChecked(audit([], ['CLR-001', 'CLR-002']))).toEqual(['color contrast']);
    expect(summarizeNotChecked(audit([]))).toEqual([]);
  });
});

describe('summarizeFileChanges', () => {
  it('does not ask for a description of the scanned page itself', () => {
    const imageFinding = finding('IMG-001', { severity: 'critical', category: 'Images & Non-Text Content', location: { page: 1 } });
    const scan = {
      id: 'f',
      name: 'scan.pdf',
      size: 1,
      status: 'remediated',
      progress: 100,
      ocrAttempted: true,
      ocrApplied: false,
      remediatedParsedData: {
        pageCount: 1,
        metadata: {},
        hasStructTree: false,
        tags: [],
        textItems: [],
        images: [{ id: 'scan', page: 1, x: 0, y: 0, width: 612, height: 792 }],
        links: [],
        outlines: [],
        forms: []
      },
      auditResult: audit([imageFinding, finding('DOC-004', { severity: 'critical' })]),
      postRemediationAudit: audit([imageFinding, finding('DOC-004', { severity: 'critical' })])
    } satisfies FileEntry;

    expect(summarizeFileChanges(scan).remaining.map((item) => item.ruleId)).toEqual(['DOC-004']);
  });
});
