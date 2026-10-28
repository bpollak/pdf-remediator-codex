// Below this, another model attempt cannot realistically finish, so the route
// stops trying fallbacks and answers instead.
export const MIN_ATTEMPT_MS = 3_000;

export interface RequestDeadline {
  remainingMs(): number;
  /**
   * Timeout for the next upstream attempt: the per-attempt budget, cut down to
   * what is left of the request. Undefined when too little time is left.
   */
  attemptTimeoutMs(perAttemptMs: number): number | undefined;
}

/**
 * One deadline for the whole request, derived from the route's maxDuration
 * minus a safety margin, so the route always returns JSON before the platform
 * kills the function.
 */
export function createRequestDeadline(maxDurationSeconds: number, safetyMarginMs: number): RequestDeadline {
  const endsAt = Date.now() + maxDurationSeconds * 1000 - safetyMarginMs;
  const remainingMs = () => Math.max(0, endsAt - Date.now());
  return {
    remainingMs,
    attemptTimeoutMs(perAttemptMs) {
      const remaining = remainingMs();
      if (remaining < MIN_ATTEMPT_MS) return undefined;
      return Math.min(perAttemptMs, remaining);
    }
  };
}
