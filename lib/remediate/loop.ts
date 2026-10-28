import type { ParsedPDF } from '@/lib/pdf/types';
import type { VerapdfResult } from '@/lib/verapdf/types';
import { getVerapdfComplianceVerdict } from '@/lib/verapdf/result';

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

export interface RemediationIterationCandidate {
  iteration: number;
  internalScore: number;
  failureScore?: number;
  verapdfResult?: VerapdfResult;
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

/** FNV-1a over every byte (not a sample), prefixed with the length. */
export function createByteFingerprint(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let hash = 2166136261;

  for (let i = 0; i < view.length; i += 1) {
    hash ^= view[i]!;
    hash = Math.imul(hash, 16777619);
  }

  return `${view.length}:${hash >>> 0}`;
}

// Every pass stamps a new modification date, so dates must not count as a change.
const VOLATILE_METADATA_KEY = /date/i;
// pdf.js names fonts per loaded document (g_d3_f1, g_d4_f1, ...).
const PDFJS_DOCUMENT_FONT_PREFIX = /^g_d\d+_/;

function stableRemediationContent(parsed: ParsedPDF): string {
  const metadata = Object.fromEntries(
    Object.entries(parsed.metadata ?? {})
      .filter(([key]) => !VOLATILE_METADATA_KEY.test(key))
      .sort(([a], [b]) => a.localeCompare(b))
  );
  return JSON.stringify({ ...parsed, metadata }, (key, value: unknown) =>
    key === 'fontName' && typeof value === 'string' ? value.replace(PDFJS_DOCUMENT_FONT_PREFIX, '') : value
  );
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Fingerprint what a remediation pass produced: the re-parsed text, tags,
 * structure, images, links, forms and metadata, ignoring the modification
 * dates that change on every pass. The raw bytes can't be compared because
 * pdf-lib compresses the dated Info dictionary into an object stream.
 * Equal fingerprints on consecutive passes mean another pass won't help.
 */
export async function createRemediationFingerprint(parsed: ParsedPDF): Promise<string> {
  const data = new TextEncoder().encode(stableRemediationContent(parsed));
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    return `sha256:${toHex(await subtle.digest('SHA-256', data))}`;
  }
  return createByteFingerprint(data.buffer as ArrayBuffer);
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

  if (getVerapdfComplianceVerdict(verapdfResult) === true) {
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

function isSafeInternalScore(candidate: RemediationIterationCandidate, originalInternalScore: number): boolean {
  return candidate.internalScore >= originalInternalScore;
}

function isCompliant(candidate: RemediationIterationCandidate): boolean {
  return getVerapdfComplianceVerdict(candidate.verapdfResult) === true;
}

function normalizedFailureScore(candidate: RemediationIterationCandidate): number {
  return typeof candidate.failureScore === 'number' ? candidate.failureScore : Number.POSITIVE_INFINITY;
}

function isBetterCandidate(
  candidate: RemediationIterationCandidate,
  best: RemediationIterationCandidate,
  originalInternalScore: number
): boolean {
  const candidateSafe = isSafeInternalScore(candidate, originalInternalScore);
  const bestSafe = isSafeInternalScore(best, originalInternalScore);
  if (candidateSafe !== bestSafe) return candidateSafe;

  const candidateCompliant = isCompliant(candidate);
  const bestCompliant = isCompliant(best);
  if (candidateCompliant !== bestCompliant) return candidateCompliant;

  const candidateFailure = normalizedFailureScore(candidate);
  const bestFailure = normalizedFailureScore(best);
  if (candidateFailure !== bestFailure) return candidateFailure < bestFailure;

  if (candidate.internalScore !== best.internalScore) {
    return candidate.internalScore > best.internalScore;
  }

  return candidate.iteration < best.iteration;
}

export function selectBestRemediationIteration(
  candidates: RemediationIterationCandidate[],
  originalInternalScore: number
): RemediationIterationCandidate | undefined {
  if (!candidates.length) return undefined;

  let best = candidates[0]!;
  for (const candidate of candidates.slice(1)) {
    if (isBetterCandidate(candidate, best, originalInternalScore)) {
      best = candidate;
    }
  }
  return best;
}
