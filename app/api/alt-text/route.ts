import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import {
  requestTritonAiAltText,
  TritonAiRequestError,
  validateImageDataUrl,
  type AltTextSuggestionInput
} from '@/lib/alt-text/tritonai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_IMAGE_DATA_URL_LENGTH = 2_500_000;
const DEFAULT_LITELLM_BASE_URL = 'https://tritonai-api.ucsd.edu';
const DEFAULT_LITELLM_MODEL = 'gpt-5.5';
const DEFAULT_ALT_TEXT_FALLBACK_MODELS = ['api-mistral-small-3.2-2506', 'api-gemma-4-26b'];
const DEFAULT_TIMEOUT_MS = 45_000;

function resolveClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'unknown';
}

function getApiKey(): string | undefined {
  return process.env.LITELLM_API_KEY?.trim() || process.env.TRITONAI_API_KEY?.trim();
}

function getBaseUrl(): string {
  return process.env.LITELLM_BASE_URL?.trim() || process.env.TRITONAI_BASE_URL?.trim() || DEFAULT_LITELLM_BASE_URL;
}

function getModel(): string {
  return process.env.LITELLM_MODEL?.trim() || process.env.TRITONAI_MODEL?.trim() || DEFAULT_LITELLM_MODEL;
}

function uniqueValues(values: string[]): string[] {
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

function getModelCandidates(): string[] {
  const configured = getModel();
  const fallbackModels = process.env.LITELLM_FALLBACK_MODELS || process.env.TRITONAI_FALLBACK_MODELS;
  return uniqueValues([
    configured,
    ...(fallbackModels ? fallbackModels.split(',') : DEFAULT_ALT_TEXT_FALLBACK_MODELS)
  ]);
}

function getTimeoutMs(): number {
  const raw = Number(process.env.LITELLM_TIMEOUT_MS ?? process.env.TRITONAI_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(raw, 5_000), 55_000);
}

function normalizeBody(value: unknown): AltTextSuggestionInput | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const body = value as Record<string, unknown>;
  const imageDataUrl = validateImageDataUrl(body.imageDataUrl);
  const imageLabel = typeof body.imageLabel === 'string' ? body.imageLabel.trim().slice(0, 120) : '';

  if (!imageDataUrl || imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH || !imageLabel) {
    return undefined;
  }

  return {
    imageDataUrl,
    imageLabel,
    documentName: typeof body.documentName === 'string' ? body.documentName.trim().slice(0, 180) : undefined,
    nearbyText: typeof body.nearbyText === 'string' ? body.nearbyText.trim().slice(0, 800) : undefined,
    page: typeof body.page === 'number' && Number.isFinite(body.page) ? body.page : undefined
  };
}

export async function POST(request: NextRequest) {
  const ip = resolveClientIp(request);
  const rl = rateLimit(ip, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    );
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'TritonAI is not configured. Set LITELLM_API_KEY or TRITONAI_API_KEY.' },
      { status: 503 }
    );
  }

  const input = normalizeBody(await request.json().catch(() => null));
  if (!input) {
    return NextResponse.json({ error: 'Expected imageDataUrl and imageLabel fields.' }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getTimeoutMs());

  try {
    const baseUrl = getBaseUrl();
    const failures: Array<{ model: string; status?: number; detail?: string }> = [];

    for (const model of getModelCandidates()) {
      try {
        const suggestion = await requestTritonAiAltText(input, {
          apiKey,
          baseUrl,
          model,
          signal: controller.signal
        });

        return NextResponse.json(suggestion, {
          status: 200,
          headers: {
            'cache-control': 'no-store'
          }
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error;
        if (error instanceof TritonAiRequestError) {
          failures.push({ model, status: error.status, detail: error.detail });
        } else {
          failures.push({
            model,
            detail: error instanceof Error ? error.message : 'Unknown alt-text model error'
          });
        }
      }
    }

    console.error('TritonAI alt-text failed for all model candidates', failures);

    return NextResponse.json(
      {
        error: 'Failed to generate alt-text recommendation.',
        hint: 'All configured TritonAI alt-text models failed.',
        attemptedModels: failures.map((failure) => ({
          model: failure.model,
          status: failure.status,
          detail: failure.detail?.slice(0, 200)
        }))
      },
      { status: 502 }
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: 'TritonAI alt-text request timed out.' }, { status: 504 });
    }

    if (error instanceof TritonAiRequestError) {
      const model = getModel();
      console.error('TritonAI alt-text upstream request failed', {
        status: error.status,
        model,
        detail: error.detail
      });

      const hint =
        error.status === 401 || error.status === 403
          ? 'TritonAI rejected the configured API key.'
          : error.status === 404
            ? `TritonAI could not find model "${model}".`
            : error.status === 400
              ? `TritonAI rejected the alt-text request for model "${model}".`
              : 'TritonAI returned an upstream error.';

      return NextResponse.json(
        {
          error: 'Failed to generate alt-text recommendation.',
          hint,
          upstreamStatus: error.status
        },
        { status: 502 }
      );
    }

    console.error('TritonAI alt-text recommendation failed', error);

    return NextResponse.json(
      {
        error: 'Failed to generate alt-text recommendation.',
        ...(process.env.NODE_ENV === 'development'
          ? { detail: error instanceof Error ? error.message : 'Unknown error' }
          : {})
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}
