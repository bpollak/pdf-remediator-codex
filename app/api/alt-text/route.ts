import { NextRequest, NextResponse } from 'next/server';
import { guardApiRequest } from '@/lib/rate-limit';
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
// Per model attempt, so a stalled primary still leaves time for a fallback.
const DEFAULT_TIMEOUT_MS = 20_000;

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
  return Math.min(Math.max(raw, 5_000), 25_000);
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
  const refused = guardApiRequest(request, 'alt-text', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (refused) return refused;

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

  const baseUrl = getBaseUrl();
  const timeoutMs = getTimeoutMs();
  const failures: Array<{ model: string; status?: number; detail?: string }> = [];

  for (const model of getModelCandidates()) {
    try {
      const suggestion = await requestTritonAiAltText(input, {
        apiKey,
        baseUrl,
        model,
        signal: AbortSignal.timeout(timeoutMs)
      });

      return NextResponse.json(suggestion, {
        status: 200,
        headers: {
          'cache-control': 'no-store'
        }
      });
    } catch (error) {
      if (error instanceof TritonAiRequestError) {
        failures.push({ model, status: error.status, detail: error.detail });
      } else if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        failures.push({ model, status: 504, detail: 'Timed out.' });
      } else {
        failures.push({
          model,
          detail: error instanceof Error ? error.message : 'Unknown alt-text model error'
        });
      }
    }
  }

  // Upstream detail can name internal deployments, so it stays in the server log.
  console.error('TritonAI alt-text failed for all model candidates', failures);

  const allTimedOut = failures.length > 0 && failures.every((failure) => failure.status === 504);
  const authRejected = failures.some((failure) => failure.status === 401 || failure.status === 403);

  return NextResponse.json(
    {
      error: allTimedOut ? 'TritonAI alt-text request timed out.' : 'Failed to generate alt-text recommendation.',
      hint: authRejected ? 'TritonAI rejected the configured API key.' : 'All configured TritonAI alt-text models failed.',
      attemptedModels: failures.map((failure) => ({
        model: failure.model,
        status: failure.status
      }))
    },
    { status: allTimedOut ? 504 : 502 }
  );
}
