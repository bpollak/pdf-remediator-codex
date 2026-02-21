import type { VerapdfResult } from '@/lib/verapdf/types';

export const MAX_REMEDIATION_ITERATIONS = 3;

export type RemediationStopReason =
  | 'compliant'
  | 'service_unavailable'
  | 'no_change'
  | 'no_improvement'
  | 'max_iterations';

export interface RemediationIterationSummary {
  iteration: number;
  internalScore: number;
  verapdfCompliant?: boolean;
  failedRules?: number;
  failedChecks?: number;
}

export interface RemediationLoopDecisionInput {
  iteration: number;
  maxIterations: number;
  verapdfResult?: VerapdfResult;
  currentFingerprint?: string;
  previousFingerprint?: string;
  currentFailureScore?: number;
  previousFailureScore?: number;
}

export interface RemediationLoopDecision {
  continue: boolean;
  reason?: RemediationStopReason;
}

export function computeFailureScore(result?: VerapdfResult): number | undefined {
  if (!result) return undefined;
  if (typeof result.summary?.failedChecks === 'number') return result.summary.failedChecks;
  if (typeof result.summary?.failedRules === 'number') return result.summary.failedRules;
  return undefined;
}

export function createByteFingerprint(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let hash = 2166136261;
  const step = Math.max(1, Math.floor(view.length / 256));

  for (let i = 0; i < view.length; i += step) {
    hash ^= view[i]!;
    hash = Math.imul(hash, 16777619);
  }

  return `${view.length}:${hash >>> 0}`;
}

export function decideRemediationLoop(input: RemediationLoopDecisionInput): RemediationLoopDecision {
  const {
    iteration,
    maxIterations,
    verapdfResult,
    currentFingerprint,
    previousFingerprint,
    currentFailureScore,
    previousFailureScore
  } = input;

  if (verapdfResult?.attempted === false) {
    return { continue: false, reason: 'service_unavailable' };
  }

  if (verapdfResult?.compliant === true) {
    return { continue: false, reason: 'compliant' };
  }

  if (currentFingerprint && previousFingerprint && currentFingerprint === previousFingerprint) {
    return { continue: false, reason: 'no_change' };
  }

  if (
    typeof currentFailureScore === 'number' &&
    typeof previousFailureScore === 'number' &&
    currentFailureScore >= previousFailureScore
  ) {
    return { continue: false, reason: 'no_improvement' };
  }

  if (iteration >= maxIterations) {
    return { continue: false, reason: 'max_iterations' };
  }

  return { continue: true };
}
