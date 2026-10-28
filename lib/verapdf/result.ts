import type { VerapdfResult } from './types';

function normalizeReason(reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  const trimmed = reason.trim();
  if (!trimmed) return undefined;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * veraPDF names the PDF/UA-1 profile in several ways depending on version
 * and output format: "PDF/UA-1", "PDF/UA-1 validation profile", "PDFUA-1",
 * or the flavour id "ua1".
 */
const PDF_UA_1_PROFILE = /^\s*(ua1|pdf\s*[/_-]?\s*ua\s*[-_ ]?\s*1)\b/i;

/**
 * False when the report names a profile other than PDF/UA-1 (e.g. PDF/A or
 * PDF/UA-2): its verdict says nothing about PDF/UA-1. A report without a
 * profile name is accepted, because the API route always requests the
 * PDF/UA-1 profile.
 */
export function isPdfUa1Profile(profile: string | undefined): boolean {
  if (!profile?.trim()) return true;
  return PDF_UA_1_PROFILE.test(profile);
}

export function getVerapdfComplianceVerdict(result: VerapdfResult | undefined): boolean | undefined {
  if (!result) return undefined;
  if (!isPdfUa1Profile(result.profile)) return undefined;
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

  if (!isPdfUa1Profile(result.profile)) {
    return `veraPDF checked this file against "${result.profile?.trim()}", not PDF/UA-1, so it is not a PDF/UA verdict.`;
  }

  if (getVerapdfComplianceVerdict(result) !== undefined) {
    return undefined;
  }

  return normalizeReason(result.reason) ?? 'veraPDF did not return a final compliance verdict.';
}
