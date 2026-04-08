import { describe, expect, it } from 'vitest';
import {
  ensureSentence,
  findingActionTitle,
  findingDescription,
  findingDetails
} from '@/lib/report/finding-copy';
import type { AuditFinding } from '@/lib/audit/types';

function makeFinding(overrides: Partial<AuditFinding> = {}): AuditFinding {
  return {
    ruleId: 'IMG-001',
    category: 'Images & Non-Text Content',
    severity: 'critical',
    description: 'Images are missing alternative text.',
    wcagCriterion: '1.1.1',
    location: {},
    recommendation: 'Add descriptive alt text to each image',
    autoFixable: false,
    ...overrides
  };
}

describe('ensureSentence', () => {
  it('adds period to text without terminal punctuation', () => {
    expect(ensureSentence('Hello')).toBe('Hello.');
  });

  it('does not add period when text ends with period', () => {
    expect(ensureSentence('Done.')).toBe('Done.');
  });

  it('does not add period when text ends with exclamation', () => {
    expect(ensureSentence('Done!')).toBe('Done!');
  });

  it('does not add period when text ends with question mark', () => {
    expect(ensureSentence('Done?')).toBe('Done?');
  });

  it('returns empty string for empty input', () => {
    expect(ensureSentence('')).toBe('');
  });

  it('trims whitespace', () => {
    expect(ensureSentence('  Hello  ')).toBe('Hello.');
  });
});

describe('findingActionTitle', () => {
  it('returns specific title for known rule IDs', () => {
    expect(findingActionTitle(makeFinding({ ruleId: 'DOC-001' }))).toContain('metadata');
    expect(findingActionTitle(makeFinding({ ruleId: 'DOC-002' }))).toContain('tags');
    expect(findingActionTitle(makeFinding({ ruleId: 'DOC-003' }))).toContain('language');
    expect(findingActionTitle(makeFinding({ ruleId: 'DOC-004' }))).toContain('OCR');
    expect(findingActionTitle(makeFinding({ ruleId: 'DOC-005' }))).toContain('Bind');
    expect(findingActionTitle(makeFinding({ ruleId: 'HDG-001' }))).toContain('heading');
    expect(findingActionTitle(makeFinding({ ruleId: 'HDG-002' }))).toContain('heading');
    expect(findingActionTitle(makeFinding({ ruleId: 'IMG-001' }))).toContain('alt text');
    expect(findingActionTitle(makeFinding({ ruleId: 'IMG-002' }))).toContain('alt text');
    expect(findingActionTitle(makeFinding({ ruleId: 'TBL-001' }))).toContain('table');
    expect(findingActionTitle(makeFinding({ ruleId: 'TBL-002' }))).toContain('table');
    expect(findingActionTitle(makeFinding({ ruleId: 'LST-001' }))).toContain('list');
    expect(findingActionTitle(makeFinding({ ruleId: 'LNK-001' }))).toContain('link');
    expect(findingActionTitle(makeFinding({ ruleId: 'LNK-002' }))).toContain('bookmark');
    expect(findingActionTitle(makeFinding({ ruleId: 'FRM-001' }))).toContain('label');
    expect(findingActionTitle(makeFinding({ ruleId: 'FRM-002' }))).toContain('required');
    expect(findingActionTitle(makeFinding({ ruleId: 'META-001' }))).toContain('subject');
    expect(findingActionTitle(makeFinding({ ruleId: 'META-002' }))).toContain('tab order');
    expect(findingActionTitle(makeFinding({ ruleId: 'CLR-001' }))).toContain('contrast');
  });

  it('returns generic fallback for unknown rule IDs', () => {
    const title = findingActionTitle(makeFinding({ ruleId: 'UNKNOWN-999' }));
    expect(title).toContain('Fix remaining');
  });
});

describe('findingDescription', () => {
  it('includes recommendation', () => {
    const desc = findingDescription(makeFinding());
    expect(desc).toContain('Do this:');
    expect(desc).toContain('alt text');
  });

  it('includes page location when present', () => {
    const desc = findingDescription(makeFinding({
      location: { page: 3, element: 'img-1' }
    }));
    expect(desc).toContain('Page 3');
    expect(desc).toContain('img-1');
  });

  it('includes manual fix hint for known rules', () => {
    const desc = findingDescription(makeFinding({ ruleId: 'IMG-001' }));
    expect(desc).toContain('How to fix it:');
  });
});

describe('findingDetails', () => {
  it('includes rule ID and WCAG criterion', () => {
    const details = findingDetails(makeFinding());
    expect(details).toContain('IMG-001');
    expect(details).toContain('WCAG 1.1.1');
  });

  it('omits WCAG when criterion is empty', () => {
    const details = findingDetails(makeFinding({ wcagCriterion: '' }));
    expect(details).toContain('IMG-001');
    expect(details).not.toContain('WCAG');
  });
});
