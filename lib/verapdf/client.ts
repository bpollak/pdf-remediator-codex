import type { VerapdfResult } from './types';
import { CLIENT_VERAPDF_TIMEOUT_MS } from './config';
import { createAbortError, deadlineSignal, isAbortError, sleep } from '@/lib/client/deadline';

const VERAPDF_API_PATH = '/api/verapdf';
const MAX_RETRIES = 1;
const RETRYABLE_STATUSES = new Set([502, 504]);
// Retrying these can't help: the answer will be the same.
const NON_RETRYABLE_CODES = new Set(['not_configured', 'misconfigured', 'upstream_auth', 'payload_too_large', 'rate_limited', 'invalid_request', 'cross_site']);

/**
 * Vercel rejects request bodies over 4.5 MB with a plain-text 413 before the
 * route runs. Stay below it, leaving room for the multipart envelope.
 */
export const VERAPDF_MAX_UPLOAD_BYTES = 4_400_000;
export const VERAPDF_TOO_LARGE_REASON =
  'This PDF is too large for online verification; check it in PAC or Acrobat instead.';

const UNAVAILABLE_REASON = 'Online PDF/UA verification is unavailable right now.';
const TIMED_OUT_REASON = 'Online PDF/UA verification timed out.';
const BUSY_REASON = 'Online PDF/UA verification is busy; it was skipped for this file.';

// Once the service is down, skip it for a while instead of waiting on it for
// every file and every remediation pass.
const SERVICE_UNAVAILABLE_COOLDOWN_MS = 5 * 60_000;
const BAD_GATEWAY_COOLDOWN_MS = 60_000;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60_000;
let serviceUnavailableUntil = 0;
let serviceUnavailableReason = UNAVAILABLE_REASON;

interface ErrorPayload {
  attempted?: boolean;
  code?: string;
  reason?: string;
  error?: string;
  detail?: string;
}

export interface RunVerapdfOptions {
  /** Aborting rejects with an AbortError instead of returning a result. */
  signal?: AbortSignal;
}

export function __resetVerapdfCircuitForTests() {
  serviceUnavailableUntil = 0;
  serviceUnavailableReason = UNAVAILABLE_REASON;
}

function markServiceUnavailable(reason: string, cooldownMs = SERVICE_UNAVAILABLE_COOLDOWN_MS): VerapdfResult {
  serviceUnavailableUntil = Math.max(serviceUnavailableUntil, Date.now() + cooldownMs);
  serviceUnavailableReason = reason;
  return { attempted: false, reason };
}

function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_RATE_LIMIT_COOLDOWN_MS;
}

function withDetail(reason: string, payload: ErrorPayload | null): string {
  const detail = typeof payload?.detail === 'string' ? payload.detail.trim() : '';
  return detail ? `${reason} (${detail})` : reason;
}

/**
 * Map an error response to a result. Every failure is `attempted: false`
 * (no verdict), so the remediation loop stops instead of re-running full
 * passes against a service that can't answer.
 */
function resultForErrorResponse(response: Response, payload: ErrorPayload | null): VerapdfResult {
  const code = payload?.code;
  const status = response.status;

  if (code === 'payload_too_large' || status === 413) {
    return { attempted: false, reason: VERAPDF_TOO_LARGE_REASON };
  }
  if (code === 'rate_limited' || status === 429) {
    return markServiceUnavailable(BUSY_REASON, retryAfterMs(response));
  }
  if (code === 'upstream_error' && status === 503) {
    // Busy rather than down: skip this file but don't start the long cooldown.
    return markServiceUnavailable(withDetail(UNAVAILABLE_REASON, payload), BAD_GATEWAY_COOLDOWN_MS);
  }
  if (
    code === 'not_configured' ||
    code === 'misconfigured' ||
    code === 'upstream_auth' ||
    status === 503 ||
    status === 401 ||
    status === 403
  ) {
    return markServiceUnavailable(withDetail(UNAVAILABLE_REASON, payload));
  }
  if (code === 'upstream_timeout' || status === 504) {
    return markServiceUnavailable(withDetail(TIMED_OUT_REASON, payload));
  }
  if (status === 502) {
    const reason = payload?.reason ?? payload?.error ?? UNAVAILABLE_REASON;
    return markServiceUnavailable(withDetail(reason, payload), BAD_GATEWAY_COOLDOWN_MS);
  }

  const reason = payload?.reason ?? payload?.error ?? `veraPDF verification failed (${status})`;
  return { attempted: false, reason: withDetail(reason, payload) };
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

export async function runVerapdfViaApi(
  bytes: ArrayBuffer,
  fileName: string,
  options: RunVerapdfOptions = {}
): Promise<VerapdfResult> {
  const { signal } = options;
  if (signal?.aborted) throw createAbortError();

  if (bytes.byteLength > VERAPDF_MAX_UPLOAD_BYTES) {
    return { attempted: false, reason: VERAPDF_TOO_LARGE_REASON };
  }
  if (Date.now() < serviceUnavailableUntil) {
    return { attempted: false, reason: serviceUnavailableReason };
  }

  const formData = new FormData();
  formData.append('file', new File([bytes], fileName, { type: 'application/pdf' }));

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    if (attempt > 0) {
      await sleep(1000 * 2 ** (attempt - 1), signal);
    }

    const deadline = deadlineSignal(CLIENT_VERAPDF_TIMEOUT_MS, signal);

    try {
      const response = await fetch(VERAPDF_API_PATH, {
        method: 'POST',
        body: formData,
        signal: deadline.signal
      });

      if (!response.ok) {
        // Vercel's own 413 is plain text, so the payload may be null.
        const errorPayload = await response.json().catch(() => null) as ErrorPayload | null;
        const retryable = RETRYABLE_STATUSES.has(response.status) && !NON_RETRYABLE_CODES.has(errorPayload?.code ?? '');
        if (retryable && attempt < MAX_RETRIES) {
          continue;
        }
        return resultForErrorResponse(response, errorPayload);
      }

      const body = await response.json().catch(() => null);
      const parsed = parseResult(body);
      if (parsed) return parsed;

      return { attempted: true, reason: 'veraPDF returned an unexpected response.' };
    } catch (error) {
      if (signal?.aborted) throw createAbortError();
      if (deadline.timedOut() || isAbortError(error)) {
        // Already waited the full client budget; don't wait it again.
        return markServiceUnavailable(TIMED_OUT_REASON);
      }
      if (attempt < MAX_RETRIES) continue;
      // Offline, DNS, CORS or a dropped connection.
      return markServiceUnavailable(UNAVAILABLE_REASON);
    } finally {
      deadline.dispose();
    }
  }

  return markServiceUnavailable(UNAVAILABLE_REASON);
}
