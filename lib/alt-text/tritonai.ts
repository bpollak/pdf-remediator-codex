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

function supportsCustomTemperature(model: string): boolean {
  return !model.startsWith('gpt-5');
}

function stripJsonFences(value: string): string {
  const trimmed = value.trim();
  const fence = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return (fence ? fence[1] : trimmed).trim();
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

export function parseAltTextSuggestion(content: unknown): AltTextSuggestion {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('TritonAI returned an empty alt-text response.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFences(content));
  } catch {
    throw new Error('TritonAI returned alt-text that was not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('TritonAI returned an invalid alt-text payload.');
  }

  const record = parsed as Record<string, unknown>;
  const decorative = record.decorative === true;
  const alt = decorative ? '' : normalizeAltText(record.alt);

  if (!decorative && alt.length < 8) {
    throw new Error('TritonAI did not return a usable alt-text recommendation.');
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

export function buildTritonAiRequest(input: AltTextSuggestionInput, config: Pick<TritonAiConfig, 'model'> = {}) {
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
    max_tokens: 500,
    response_format: { type: 'json_object' },
    ...(supportsCustomTemperature(model) ? { temperature: 0.2 } : {})
  };
}

export async function requestTritonAiAltText(
  input: AltTextSuggestionInput,
  config: TritonAiConfig
): Promise<AltTextSuggestion> {
  const baseUrl = (config.baseUrl || DEFAULT_LITELLM_BASE_URL).replace(/\/+$/, '');
  const model = config.model || DEFAULT_LITELLM_MODEL;
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(buildTritonAiRequest(input, { model })),
    signal: config.signal,
    cache: 'no-store'
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`TritonAI request failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }

  const payload = await response.json();
  return parseAltTextSuggestion(payload?.choices?.[0]?.message?.content);
}

