// Shared helpers for calling the TritonAI (LiteLLM) gateway from the
// alt-text and OCR routes.

export const DEFAULT_LITELLM_BASE_URL = 'https://tritonai-api.ucsd.edu';
export const DEFAULT_FALLBACK_MODELS = ['api-mistral-small-3.2-2506', 'api-gemma-4-26b'];
// Bounds how many models one request can try, whatever the env lists.
export const MAX_MODEL_CANDIDATES = 3;

export interface GatewaySettings {
  apiKey?: string;
  baseUrl: string;
  /** Which setting the base URL came from, for server-side log messages. */
  baseUrlSetting: string;
}

/** Gateway settings for alt-text suggestions. */
export function getAltTextGatewaySettings(): GatewaySettings {
  const fromLiteLlm = process.env.LITELLM_BASE_URL?.trim();
  const fromTritonAi = process.env.TRITONAI_BASE_URL?.trim();
  return {
    apiKey: process.env.LITELLM_API_KEY?.trim() || process.env.TRITONAI_API_KEY?.trim(),
    baseUrl: fromLiteLlm || fromTritonAi || DEFAULT_LITELLM_BASE_URL,
    baseUrlSetting: fromLiteLlm ? 'LITELLM_BASE_URL' : fromTritonAi ? 'TRITONAI_BASE_URL' : 'default'
  };
}

/** Gateway settings for page OCR; falls back to the alt-text settings. */
export function getOcrGatewaySettings(): GatewaySettings {
  return {
    apiKey: process.env.OCR_LITELLM_API_KEY || process.env.LITELLM_API_KEY,
    baseUrl: (process.env.OCR_LITELLM_BASE_URL || process.env.LITELLM_BASE_URL || DEFAULT_LITELLM_BASE_URL).replace(
      /\/+$/,
      ''
    ),
    baseUrlSetting: process.env.OCR_LITELLM_BASE_URL
      ? 'OCR_LITELLM_BASE_URL'
      : process.env.LITELLM_BASE_URL
        ? 'LITELLM_BASE_URL'
        : 'default'
  };
}

export function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

/**
 * The configured model first, then the comma-separated fallback setting (or
 * the default fallbacks when it is unset or empty), capped at
 * MAX_MODEL_CANDIDATES.
 */
export function getModelCandidates(primary: string, fallbackSetting: string | undefined): string[] {
  return uniqueValues([primary, ...(fallbackSetting ? fallbackSetting.split(',') : DEFAULT_FALLBACK_MODELS)]).slice(
    0,
    MAX_MODEL_CANDIDATES
  );
}

export function stripJsonFences(value: string): string {
  const trimmed = value.trim();
  const fence = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return (fence ? fence[1] : trimmed).trim();
}
