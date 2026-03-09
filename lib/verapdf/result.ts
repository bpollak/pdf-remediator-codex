import type { VerapdfResult } from './types';

function normalizeReason(reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  const trimmed = reason.trim();
  if (!trimmed) return undefined;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function getVerapdfComplianceVerdict(result: VerapdfResult | undefined): boolean | undefined {
  if (!result) return undefined;
  if (typeof result.compliant === 'boolean') return result.compliant;

  if (typeof result.summary?.failedRules === 'number') {
    return result.summary.failedRules === 0;
  }

  if (typeof result.summary?.failedChecks === 'number') {
    return result.summary.failedChecks === 0;
  }

  if (!result.statement) return undefined;
  const normalizedStatement = result.statement.toLowerCase();

  if (normalizedStatement.includes('not compliant') || normalizedStatement.includes('non-compliant')) {
    return false;
  }

  if (normalizedStatement.includes('compliant')) {
    return true;
  }

  if (normalizedStatement.includes('failed') || normalizedStatement.includes('fails')) {
    return false;
  }

  return undefined;
}

export function getVerapdfUnavailableReason(result: VerapdfResult | undefined): string | undefined {
  if (!result) {
    return 'No external PDF/UA verification result is available.';
  }

  if (result.attempted === false) {
    return normalizeReason(result.reason) ?? 'External PDF/UA verification is unavailable.';
  }

  if (getVerapdfComplianceVerdict(result) !== undefined) {
    return undefined;
  }

  return normalizeReason(result.reason) ?? 'veraPDF did not return a final compliance verdict.';
}
