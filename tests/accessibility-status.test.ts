import { describe, expect, it } from 'vitest';
import type { AuditFinding, AuditResult } from '@/lib/audit/types';
import { getAccessibilityStatus, getPublishReadiness } from '@/lib/report/accessibility-status';
import type { FileEntry } from '@/types/file-entry';

function finding(overrides: Partial<AuditFinding> = {}): AuditFinding {
  return {
    ruleId: 'DOC-001',
    category: 'Document Structure',
    severity: 'major',
    description: 'Missing metadata identifier.',
    wcagCriterion: '4.1.2 Name, Role, Value',
    location: {},
    recommendation: 'Add metadata identifier.',
    autoFixable: false,
    ...overrides
  };
}

function auditResult(score: number, findings: AuditFinding[] = [], notChecked?: string[]): AuditResult {
  return { score, findings, ...(notChecked ? { notChecked } : {}) };
}

function file(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    id: 'file-1',
    name: 'sample.pdf',
    size: 1024,
    uploadedBytes: new ArrayBuffer(8),
    remediatedBytes: new ArrayBuffer(8),
    status: 'remediated',
    progress: 100,
    postRemediationAudit: auditResult(100, []),
    verapdfResult: {
      attempted: true,
      compliant: true,
      summary: {
        passedRules: 32,
        failedRules: 0,
        passedChecks: 400,
        failedChecks: 0
      }
    },
    ...overrides
  };
}

describe('getAccessibilityStatus', () => {
  it('explains why processing stopped using the queue\'s plain-language error', () => {
    const result = getAccessibilityStatus(
      file({ status: 'error', error: 'This PDF is digitally signed. Changing it would invalidate the signature.' })
    );
    expect(result.status).toBe('not-yet-accessible');
    expect(result.message).toContain('digitally signed');
    expect(result.message).not.toMatch(/upload/i);
  });

  it('shows the analysis-only cap on scores stored before the audit applied it', () => {
    const result = getAccessibilityStatus(
      file({ remediationMode: 'analysis-only', postRemediationAudit: auditResult(92) })
    );
    expect(result.automatedScore).toBe(40);
    expect(result.status).not.toBe('accessible');
  });

  it('returns the top state only when all publish checks pass, without claiming the PDF is accessible', () => {
    const result = getAccessibilityStatus(file());

    expect(result.status).toBe('accessible');
    expect(result.label).toBe('Passed automated checks — a person still needs to review it');
    expect(result.label).not.toMatch(/^Accessible$/);
    expect(result.reasons).toEqual([]);
    expect(result.automatedScore).toBe(100);
  });

  it('returns Not yet accessible when the automated baseline is below 100', () => {
    const result = getAccessibilityStatus(
      file({
        postRemediationAudit: auditResult(99, [])
      })
    );

    expect(result.status).toBe('not-yet-accessible');
    expect(result.reasons.map((reason) => reason.code)).toEqual(['score-below-100']);
  });

  it('returns Not yet accessible when internal findings remain', () => {
    const result = getAccessibilityStatus(
      file({
        postRemediationAudit: auditResult(92, [finding({ severity: 'critical', ruleId: 'DOC-005' })]),
        verapdfResult: {
          attempted: true,
          compliant: false,
          summary: {
            failedRules: 2,
            failedChecks: 5
          }
        }
      })
    );

    expect(result.status).toBe('not-yet-accessible');
    expect(result.reasons).toContainEqual(expect.objectContaining({ code: 'internal-findings' }));
    expect(result.reasons).toContainEqual(expect.objectContaining({ code: 'failed-rules' }));
    expect(result.reasons).toContainEqual(expect.objectContaining({ code: 'failed-checks' }));
  });

  it('treats unavailable verification as a blocking status', () => {
    const result = getAccessibilityStatus(
      file({
        verapdfResult: {
          attempted: false
        }
      })
    );

    expect(result.status).toBe('verification-unavailable');
    expect(result.reasons).toContainEqual(expect.objectContaining({ code: 'verification-unavailable' }));
  });

  it('uses summary counts to infer a usable compliance verdict when explicit compliant is missing', () => {
    const result = getAccessibilityStatus(
      file({
        verapdfResult: {
          attempted: true,
          summary: {
            failedRules: 0,
            failedChecks: 0
          }
        }
      })
    );

    expect(result.status).toBe('accessible');
  });

  it('includes the specific veraPDF failure reason when verification is unavailable', () => {
    const result = getAccessibilityStatus(
      file({
        verapdfResult: {
          attempted: true,
          reason: 'veraPDF verification timed out'
        }
      })
    );

    expect(result.status).toBe('verification-unavailable');
    expect(result.detail).toBe('veraPDF verification timed out.');
  });

  it('keeps server setting names out of the verification details', () => {
    const result = getAccessibilityStatus(
      file({
        verapdfResult: {
          attempted: false,
          reason: 'veraPDF verification is not enabled for this deployment. Set VERAPDF_SERVICE_URL in Vercel environment variables.'
        }
      })
    );

    expect(result.message).not.toMatch(/VERAPDF_/);
    expect(result.detail).toBe('veraPDF verification is not enabled for this deployment.');
  });

  it('blocks Accessible for analysis-only remediation even with a perfect score', () => {
    const result = getAccessibilityStatus(
      file({
        remediationMode: 'analysis-only'
      })
    );

    expect(result.status).toBe('not-yet-accessible');
    expect(result.reasons).toContainEqual(expect.objectContaining({ code: 'analysis-only' }));
  });

  it('blocks Accessible for checker/report artifacts even with a perfect score', () => {
    const result = getAccessibilityStatus(
      file({
        sourceType: 'checker-report-artifact'
      })
    );

    expect(result.status).toBe('not-yet-accessible');
    expect(result.reasons).toContainEqual(expect.objectContaining({ code: 'source-artifact' }));
  });

  it('returns Not yet accessible when manual draft changes are waiting for re-validation', () => {
    const result = getAccessibilityStatus(
      file({
        manualReviewDrafts: {
          altText: {
            'img-1-1': {
              alt: 'Updated description',
              decorative: false
            }
          },
          structure: {
            headings: {},
            headingOrder: [],
            tableDecisions: {}
          },
          customElements: [],
          lastUpdatedAt: '2026-03-06T10:00:00.000Z'
        }
      })
    );

    expect(result.status).toBe('not-yet-accessible');
    expect(result.reasons).toContainEqual(expect.objectContaining({ code: 'pending-revalidation' }));
  });

  it('returns Processing while remediation is still running', () => {
    const result = getAccessibilityStatus(
      file({
        status: 'remediating',
        remediatedBytes: undefined,
        postRemediationAudit: undefined,
        verapdfResult: undefined
      })
    );

    expect(result.status).toBe('processing');
    expect(result.reasons).toEqual([{ code: 'processing', label: 'Updated PDF not ready yet' }]);
  });

  it('blocks the top state when some checks could not run (for example color contrast)', () => {
    const result = getAccessibilityStatus(file({ postRemediationAudit: auditResult(100, [], ['CLR-001', 'CLR-002']) }));

    expect(result.status).toBe('not-yet-accessible');
    expect(result.reasons).toContainEqual({ code: 'not-checked', label: 'Could not check: color contrast' });
  });
});

describe('getPublishReadiness', () => {
  const imageParsed = {
    pageCount: 1,
    metadata: {},
    hasStructTree: true,
    tags: [],
    textItems: [],
    images: [{ id: 'img-1', page: 1, x: 10, y: 10, width: 100, height: 100 }],
    links: [],
    outlines: [],
    forms: []
  };

  it('says the PDF passed automated checks only, when everything passes', () => {
    const readiness = getPublishReadiness(file());

    expect(readiness.blocker).toBe('none');
    expect(readiness.verdict).toBe('Passed automated checks — a person still needs to review it');
  });

  it('names missing tags in plain words for an analysis-only result', () => {
    const readiness = getPublishReadiness(file({ remediationMode: 'analysis-only' }));

    expect(readiness.blocker).toBe('analysis-only');
    expect(readiness.verdict).toBe('Not yet');
    expect(readiness.message).toContain("We couldn't add the hidden structure (tags) that screen readers need.");
  });

  it('asks for the revised PDF once the checklist is done but not yet re-checked', () => {
    const readiness = getPublishReadiness(
      file({
        remediationMode: 'analysis-only',
        workflowProgress: { structureConfirmedAt: '2026-10-28T10:00:00.000Z' }
      })
    );

    expect(readiness.checklistRemaining).toBe(0);
    expect(readiness.blocker).toBe('revalidation');
    expect(readiness.message).toBe('Checklist done. Upload the revised PDF so we can confirm the fixes.');
  });

  it('agrees with the checklist when items are still open', () => {
    const readiness = getPublishReadiness(file({ remediatedParsedData: imageParsed }));

    expect(readiness.blocker).toBe('checklist');
    expect(readiness.checklistRemaining).toBe(1);
    expect(readiness.message).toContain('1 checklist item is still open');
  });

  it('says the final check is unavailable when nothing else is in the way', () => {
    const readiness = getPublishReadiness(file({ verapdfResult: { attempted: false } }));

    expect(readiness.blocker).toBe('verification-unavailable');
    expect(readiness.message).toBe(
      'Our final automated check is unavailable right now. You can download the PDF, but check it in PAC or Acrobat before publishing.'
    );
  });

  it('points at remaining problems when the checklist is done but checks still fail', () => {
    const readiness = getPublishReadiness(
      file({ postRemediationAudit: auditResult(97, [finding({ ruleId: 'META-001', severity: 'minor' })]) })
    );

    expect(readiness.checklistRemaining).toBe(0);
    expect(readiness.blocker).toBe('remaining-issues');
  });

  it('names checks that could not run', () => {
    const readiness = getPublishReadiness(file({ postRemediationAudit: auditResult(100, [], ['CLR-001']) }));

    expect(readiness.blocker).toBe('not-checked');
    expect(readiness.message).toContain('color contrast');
  });
});
