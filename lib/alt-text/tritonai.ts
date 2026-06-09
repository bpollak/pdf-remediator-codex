export interface AltTextSuggestionInput {
  imageDataUrl: string;
  imageLabel: string;
  documentName?: string;
  nearbyText?: string;
  page?: number;
}

export interface AltTextSuggestion {
  alt: string;
  decorative: boolean;
  rationale?: string;
}

export interface TritonAiConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  signal?: AbortSignal;
}

const DEFAULT_LITELLM_BASE_URL = 'https://tritonai-api.ucsd.edu';
const DEFAULT_LITELLM_MODEL = 'gpt-5.5';
const MAX_ALT_TEXT_LENGTH = 240;

export class TritonAiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: string
  ) {
    super(message);
    this.name = 'TritonAiRequestError';
  }
}

function supportsCustomTemperature(model: string): boolean {
  return !model.startsWith('gpt-5');
}

function stripJsonFences(value: string): string {
  const trimmed = value.trim();
  const fence = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return (fence ? fence[1] : trimmed).trim();
}

/**
 * Models sometimes wrap the JSON object in prose or truncate trailing output.
 * Try the raw content first, then the outermost {...} substring.
 */
function parseJsonObjectLoosely(content: string): unknown {
  const candidates = [stripJsonFences(content)];
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start >= 0 && end > start) {
    candidates.push(content.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate.
    }
  }
  return undefined;
}

function normalizeAltText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_ALT_TEXT_LENGTH);
}

function normalizeRationale(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, 240) : undefined;
}

export function validateImageDataUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (!/^data:image\/(?:png|jpeg|jpg|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) return undefined;
  return value;
}

export function parseAltTextSuggestion(content: unknown, finishReason?: string): AltTextSuggestion {
  const finishSuffix = finishReason && finishReason !== 'stop' ? ` (finish_reason: ${finishReason})` : '';

  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(`TritonAI returned an empty alt-text response.${finishSuffix}`);
  }

  const parsed = parseJsonObjectLoosely(content);
  if (parsed === undefined) {
    throw new Error(
      `TritonAI returned alt-text that was not valid JSON.${finishSuffix} Content started with: ${content.trim().slice(0, 120)}`
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`TritonAI returned an invalid alt-text payload.${finishSuffix}`);
  }

  const record = parsed as Record<string, unknown>;
  const decorative = record.decorative === true;
  const alt = decorative ? '' : normalizeAltText(record.alt);

  if (!decorative && alt.length < 8) {
    throw new Error(`TritonAI did not return a usable alt-text recommendation.${finishSuffix}`);
  }

  return {
    alt,
    decorative,
    rationale: normalizeRationale(record.rationale)
  };
}

export function buildAltTextPrompt(input: AltTextSuggestionInput): string {
  return [
    'Draft alt text for this PDF image crop.',
    'Write for a UC San Diego staff member preparing an accessible PDF.',
    'Use nearby text only as context; do not copy it unless it describes the image.',
    'If the image is decorative or only a divider/background, return decorative true and alt as an empty string.',
    'If the image conveys information, return decorative false and a concise alt text sentence under 160 characters.',
    'Keep the rationale under 25 words.',
    'Do not start with "image of", "picture of", or "graphic of".',
    '',
    `Document: ${input.documentName?.trim() || 'uploaded PDF'}`,
    `Image: ${input.imageLabel}`,
    typeof input.page === 'number' ? `Page: ${input.page}` : undefined,
    input.nearbyText?.trim() ? `Nearby text: ${input.nearbyText.trim()}` : 'Nearby text: none detected',
    '',
    'Return JSON only with keys: alt, decorative, rationale.'
  ]
    .filter(Boolean)
    .join('\n');
}

// Reasoning models can spend most of the budget on hidden reasoning tokens
// before emitting content, so the budget must be far larger than the visible
// JSON answer.
const DEFAULT_MAX_TOKENS = 2500;
const RETRY_MAX_TOKENS = 5000;

export function buildTritonAiRequest(
  input: AltTextSuggestionInput,
  config: Pick<TritonAiConfig, 'model'> & { maxTokens?: number } = {}
) {
  const model = config.model || DEFAULT_LITELLM_MODEL;

  return {
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are an accessibility specialist drafting PDF image alt text. Return strict JSON only. Prefer accuracy over completeness.'
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildAltTextPrompt(input)
          },
          {
            type: 'image_url',
            image_url: {
              url: input.imageDataUrl
            }
          }
        ]
      }
    ],
    max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    response_format: { type: 'json_object' },
    ...(supportsCustomTemperature(model) ? { temperature: 0.2 } : {})
  };
}

async function requestTritonAiAltTextOnce(
  input: AltTextSuggestionInput,
  config: TritonAiConfig,
  maxTokens: number
): Promise<{ content: unknown; finishReason?: string }> {
  const baseUrl = (config.baseUrl || DEFAULT_LITELLM_BASE_URL).replace(/\/+$/, '');
  const model = config.model || DEFAULT_LITELLM_MODEL;
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(buildTritonAiRequest(input, { model, maxTokens })),
    signal: config.signal,
    cache: 'no-store'
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new TritonAiRequestError(
      `TritonAI request failed (${response.status})`,
      response.status,
      detail ? detail.slice(0, 600) : undefined
    );
  }

  const payload = await response.json();
  const choice = payload?.choices?.[0];
  return { content: choice?.message?.content, finishReason: choice?.finish_reason };
}

function isBudgetExhausted(content: unknown, finishReason?: string): boolean {
  return finishReason === 'length' && (typeof content !== 'string' || !content.trim());
}

export async function requestTritonAiAltText(
  input: AltTextSuggestionInput,
  config: TritonAiConfig
): Promise<AltTextSuggestion> {
  let { content, finishReason } = await requestTritonAiAltTextOnce(input, config, DEFAULT_MAX_TOKENS);

  if (isBudgetExhausted(content, finishReason)) {
    // The model spent the whole budget on reasoning tokens; retry once with more room.
    ({ content, finishReason } = await requestTritonAiAltTextOnce(input, config, RETRY_MAX_TOKENS));
  }

  return parseAltTextSuggestion(content, finishReason);
}
