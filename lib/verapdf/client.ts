import type { VerapdfResult } from './types';

const VERAPDF_API_PATH = '/api/verapdf';
const CLIENT_TIMEOUT_MS = 90_000;

function summarizeError(status: number): string {
  if (status === 503) return 'veraPDF verification service unavailable';
  if (status === 504) return 'veraPDF verification timed out';
  return `veraPDF verification failed (${status})`;
}

interface ErrorPayload {
  attempted?: boolean;
  reason?: string;
  error?: string;
  detail?: string;
}

function parseResult(payload: unknown): VerapdfResult | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;

  const summaryValue = record.summary;
  const summaryRecord =
    summaryValue && typeof summaryValue === 'object' && !Array.isArray(summaryValue)
      ? (summaryValue as Record<string, unknown>)
      : undefined;
  const summary = summaryRecord
    ? {
        passedRules: typeof summaryRecord.passedRules === 'number' ? summaryRecord.passedRules : undefined,
        failedRules: typeof summaryRecord.failedRules === 'number' ? summaryRecord.failedRules : undefined,
        passedChecks: typeof summaryRecord.passedChecks === 'number' ? summaryRecord.passedChecks : undefined,
        failedChecks: typeof summaryRecord.failedChecks === 'number' ? summaryRecord.failedChecks : undefined
      }
    : undefined;

  return {
    attempted: typeof record.attempted === 'boolean' ? record.attempted : true,
    compliant: typeof record.compliant === 'boolean' ? record.compliant : undefined,
    profile: typeof record.profile === 'string' ? record.profile : undefined,
    statement: typeof record.statement === 'string' ? record.statement : undefined,
    summary,
    reason: typeof record.reason === 'string' ? record.reason : undefined
  };
}

export async function runVerapdfViaApi(bytes: ArrayBuffer, fileName: string): Promise<VerapdfResult> {
  const formData = new FormData();
  formData.append('file', new File([bytes], fileName, { type: 'application/pdf' }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

  try {
    const response = await fetch(VERAPDF_API_PATH, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null) as ErrorPayload | null;
      const reason = errorPayload?.reason ?? errorPayload?.error ?? summarizeError(response.status);
      const detail = typeof errorPayload?.detail === 'string' && errorPayload.detail.trim()
        ? ` (${errorPayload.detail.trim()})`
        : '';
      return {
        attempted: typeof errorPayload?.attempted === 'boolean' ? errorPayload.attempted : response.status !== 503,
        reason: `${reason}${detail}`
      };
    }

    const body = await response.json().catch(() => null);
    const parsed = parseResult(body);
    if (parsed) return parsed;

    return { attempted: true, reason: 'veraPDF returned an unexpected response.' };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { attempted: true, reason: 'veraPDF verification timed out' };
    }
    return {
      attempted: true,
      reason: error instanceof Error ? error.message : 'Unknown veraPDF verification error'
    };
  } finally {
    clearTimeout(timer);
  }
}
