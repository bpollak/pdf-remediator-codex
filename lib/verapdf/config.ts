export const VERAPDF_ROUTE_MAX_DURATION_MS = 300_000;
export const DEFAULT_VERAPDF_TIMEOUT_MS = 120_000;
// Keep the upstream timeout inside the route's total runtime budget.
export const MAX_VERAPDF_TIMEOUT_MS = VERAPDF_ROUTE_MAX_DURATION_MS - 5_000;
export const VERAPDF_WARMUP_TIMEOUT_MS = 20_000;

// Keep the browser timeout slightly below the route budget so the UI does not
// abandon a validation request while the API route is still waiting on veraPDF.
export const CLIENT_VERAPDF_TIMEOUT_MS = Math.min(
  DEFAULT_VERAPDF_TIMEOUT_MS + 25_000,
  MAX_VERAPDF_TIMEOUT_MS
);
