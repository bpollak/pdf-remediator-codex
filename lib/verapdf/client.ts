import type { VerapdfResult } from './types';
import { CLIENT_VERAPDF_TIMEOUT_MS } from './config';

const VERAPDF_API_PATH = '/api/verapdf';
const MAX_RETRIES = 1;
const RETRYABLE_STATUSES = new Set([502, 504]);

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    if (attempt > 0) {
      await delay(1000 * 2 ** (attempt - 1));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_VERAPDF_TIMEOUT_MS);

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

        if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
          continue;
        }

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
        if (attempt < MAX_RETRIES) continue;
        return { attempted: true, reason: 'veraPDF verification timed out' };
      }

      if (attempt < MAX_RETRIES) continue;

      return {
        attempted: true,
        reason: error instanceof Error ? error.message : 'Unknown veraPDF verification error'
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return { attempted: true, reason: 'veraPDF verification failed after retries.' };
}
