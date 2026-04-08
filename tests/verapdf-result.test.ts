import { describe, expect, it } from 'vitest';
import { getVerapdfComplianceVerdict, getVerapdfUnavailableReason } from '@/lib/verapdf/result';
import type { VerapdfResult } from '@/lib/verapdf/types';

describe('getVerapdfComplianceVerdict', () => {
  it('returns undefined for undefined input', () => {
    expect(getVerapdfComplianceVerdict(undefined)).toBeUndefined();
  });

  it('returns explicit boolean compliant field', () => {
    expect(getVerapdfComplianceVerdict({ attempted: true, compliant: true })).toBe(true);
    expect(getVerapdfComplianceVerdict({ attempted: true, compliant: false })).toBe(false);
  });

  it('infers compliance from failedRules=0', () => {
    expect(getVerapdfComplianceVerdict({
      attempted: true,
      summary: { failedRules: 0, passedRules: 50 }
    })).toBe(true);
  });

  it('infers non-compliance from failedRules > 0', () => {
    expect(getVerapdfComplianceVerdict({
      attempted: true,
      summary: { failedRules: 3 }
    })).toBe(false);
  });

  it('infers compliance from failedChecks=0 when failedRules missing', () => {
    expect(getVerapdfComplianceVerdict({
      attempted: true,
      summary: { failedChecks: 0, passedChecks: 100 }
    })).toBe(true);
  });

  it('infers non-compliance from failedChecks > 0 when failedRules missing', () => {
    expect(getVerapdfComplianceVerdict({
      attempted: true,
      summary: { failedChecks: 5 }
    })).toBe(false);
  });

  it('infers non-compliance from "not compliant" statement', () => {
    expect(getVerapdfComplianceVerdict({
      attempted: true,
      statement: 'The file is not compliant with requirements.'
    })).toBe(false);
  });

  it('infers non-compliance from "non-compliant" statement', () => {
    expect(getVerapdfComplianceVerdict({
      attempted: true,
      statement: 'PDF is non-compliant.'
    })).toBe(false);
  });

  it('infers compliance from "compliant" statement (without negation)', () => {
    expect(getVerapdfComplianceVerdict({
      attempted: true,
      statement: 'Document is compliant with PDF/UA-1.'
    })).toBe(true);
  });

  it('infers non-compliance from "fails" statement', () => {
    expect(getVerapdfComplianceVerdict({
      attempted: true,
      statement: 'Document fails validation.'
    })).toBe(false);
  });

  it('returns undefined when no verdict can be inferred', () => {
    expect(getVerapdfComplianceVerdict({
      attempted: true,
      reason: 'veraPDF timed out'
    })).toBeUndefined();
  });

  it('prefers explicit compliant field over summary inference', () => {
    expect(getVerapdfComplianceVerdict({
      attempted: true,
      compliant: true,
      summary: { failedRules: 5 }
    })).toBe(true);
  });
});

describe('getVerapdfUnavailableReason', () => {
  it('returns generic message for undefined result', () => {
    expect(getVerapdfUnavailableReason(undefined)).toContain('No external');
  });

  it('returns reason when attempted=false', () => {
    const result: VerapdfResult = { attempted: false, reason: 'Service not configured' };
    expect(getVerapdfUnavailableReason(result)).toBe('Service not configured.');
  });

  it('returns default reason when attempted=false and no reason given', () => {
    expect(getVerapdfUnavailableReason({ attempted: false })).toContain('unavailable');
  });

  it('returns undefined when verdict is available', () => {
    expect(getVerapdfUnavailableReason({
      attempted: true,
      compliant: true
    })).toBeUndefined();
  });

  it('returns reason when attempted but no verdict', () => {
    expect(getVerapdfUnavailableReason({
      attempted: true,
      reason: 'Timed out'
    })).toBe('Timed out.');
  });

  it('adds trailing period to reason if missing', () => {
    expect(getVerapdfUnavailableReason({
      attempted: false,
      reason: 'Backend down'
    })).toBe('Backend down.');
  });

  it('does not double-add period if already present', () => {
    expect(getVerapdfUnavailableReason({
      attempted: false,
      reason: 'Backend down.'
    })).toBe('Backend down.');
  });
});
