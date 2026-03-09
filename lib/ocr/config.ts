export const DEFAULT_OCR_TIMEOUT_MS = 240_000;
export const MAX_OCR_TIMEOUT_MS = 600_000;
export const OCR_ROUTE_MAX_DURATION_MS = 300_000;

// Keep the browser timeout close to the route budget without racing the
// serverless maxDuration on slower OCR jobs.
export const CLIENT_OCR_TIMEOUT_MS = Math.min(DEFAULT_OCR_TIMEOUT_MS + 45_000, OCR_ROUTE_MAX_DURATION_MS - 5_000);
