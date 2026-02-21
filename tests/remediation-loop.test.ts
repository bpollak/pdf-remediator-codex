import { describe, expect, it } from 'vitest';
import {
  computeFailureScore,
  createByteFingerprint,
  decideRemediationLoop,
  selectBestRemediationIteration
} from '@/lib/remediate/loop';

describe('remediation loop controls', () => {
  it('prefers failed checks as failure score when available', () => {
    expect(
      computeFailureScore({
        attempted: true,
        summary: { failedRules: 4, failedChecks: 21 }
      })
    ).toBe(21);
  });

  it('falls back to failed rules for failure score', () => {
    expect(
      computeFailureScore({
        attempted: true,
        summary: { failedRules: 3 }
      })
    ).toBe(3);
  });

  it('returns stable fingerprint for same bytes', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    expect(createByteFingerprint(bytes)).toBe(createByteFingerprint(bytes.slice(0)));
  });

  it('stops when veraPDF reports compliance', () => {
    const decision = decideRemediationLoop({
      iteration: 1,
      maxIterations: 3,
      verapdfResult: { attempted: true, compliant: true }
    });
    expect(decision.continue).toBe(false);
    expect(decision.reason).toBe('compliant');
  });

  it('stops when failure score does not improve', () => {
    const decision = decideRemediationLoop({
      iteration: 2,
      maxIterations: 3,
      verapdfResult: { attempted: true, compliant: false },
      currentFailureScore: 12,
      previousFailureScore: 10
    });
    expect(decision.continue).toBe(false);
    expect(decision.reason).toBe('no_improvement');
  });

  it('continues when not compliant but improving and under iteration cap', () => {
    const decision = decideRemediationLoop({
      iteration: 1,
      maxIterations: 3,
      verapdfResult: { attempted: true, compliant: false },
      currentFailureScore: 8,
      previousFailureScore: 11,
      currentFingerprint: '10:1',
      previousFingerprint: '10:2'
    });
    expect(decision.continue).toBe(true);
    expect(decision.reason).toBeUndefined();
  });

  it('prefers candidates that do not regress below original internal score', () => {
    const selected = selectBestRemediationIteration(
      [
        {
          iteration: 1,
          internalScore: 92,
          failureScore: 200,
          verapdfResult: { attempted: true, compliant: false, summary: { failedChecks: 200 } }
        },
        {
          iteration: 2,
          internalScore: 70,
          failureScore: 120,
          verapdfResult: { attempted: true, compliant: false, summary: { failedChecks: 120 } }
        }
      ],
      78
    );

    expect(selected?.iteration).toBe(1);
  });

  it('prefers better external failure score when both candidates are above baseline', () => {
    const selected = selectBestRemediationIteration(
      [
        {
          iteration: 1,
          internalScore: 90,
          failureScore: 200,
          verapdfResult: { attempted: true, compliant: false, summary: { failedChecks: 200 } }
        },
        {
          iteration: 2,
          internalScore: 88,
          failureScore: 120,
          verapdfResult: { attempted: true, compliant: false, summary: { failedChecks: 120 } }
        }
      ],
      78
    );

    expect(selected?.iteration).toBe(2);
  });

  it('prefers compliant candidate when both are safe', () => {
    const selected = selectBestRemediationIteration(
      [
        {
          iteration: 1,
          internalScore: 95,
          failureScore: 10,
          verapdfResult: { attempted: true, compliant: false, summary: { failedChecks: 10 } }
        },
        {
          iteration: 2,
          internalScore: 88,
          failureScore: 0,
          verapdfResult: { attempted: true, compliant: true, summary: { failedChecks: 0 } }
        }
      ],
      78
    );

    expect(selected?.iteration).toBe(2);
  });
});
