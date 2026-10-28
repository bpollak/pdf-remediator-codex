import { NextRequest, NextResponse } from 'next/server';
import { assertServiceUrlSafe, guardApiRequest } from '@/lib/rate-limit';
import { createRequestDeadline, type RequestDeadline } from '@/lib/server/deadline';
import { contentLengthExceeds, isTimeoutError, jsonError } from '@/lib/server/http';
import { addTokenUsage, startRequestLog, type RequestLog, type TokenUsage } from '@/lib/server/log';
import {
  requestTritonAiAltText,
  TritonAiRequestError,
  validateImageDataUrl,
  type AltTextSuggestionInput
} from '@/lib/alt-text/tritonai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ROUTE = 'alt-text';
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_IMAGE_DATA_URL_LENGTH = 2_500_000;
// Room for the other JSON fields around the image.
const MAX_BODY_BYTES = MAX_IMAGE_DATA_URL_LENGTH + 64 * 1024;
const DEFAULT_LITELLM_BASE_URL = 'https://tritonai-api.ucsd.edu';
const DEFAULT_LITELLM_MODEL = 'gpt-5.5';
const DEFAULT_ALT_TEXT_FALLBACK_MODELS = ['api-mistral-small-3.2-2506', 'api-gemma-4-26b'];
const MAX_MODEL_CANDIDATES = 3;
// Per model attempt, so a stalled primary still leaves time for a fallback.
// Every attempt is also capped by what is left of the request deadline.
const DEFAULT_TIMEOUT_MS = 20_000;
// Leaves time to build the JSON answer before maxDuration ends the function.
const DEADLINE_SAFETY_MARGIN_MS = 5_000;
const MAX_PAGE = 10_000;

type Failure = { model: string; status?: number };

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
  ]).slice(0, MAX_MODEL_CANDIDATES);
}

function getTimeoutMs(): number {
  const raw = Number(process.env.LITELLM_TIMEOUT_MS ?? process.env.TRITONAI_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(raw, 5_000), 25_000);
}

type ParsedBody = { input: AltTextSuggestionInput } | { tooLarge: true } | undefined;

function normalizeBody(value: unknown): ParsedBody {
  if (!value || typeof value !== 'object') return undefined;
  const body = value as Record<string, unknown>;
  if (typeof body.imageDataUrl === 'string' && body.imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    return { tooLarge: true };
  }
  const imageDataUrl = validateImageDataUrl(body.imageDataUrl);
  const imageLabel = typeof body.imageLabel === 'string' ? body.imageLabel.trim().slice(0, 120) : '';

  if (!imageDataUrl || !imageLabel) {
    return undefined;
  }

  return {
    input: {
      imageDataUrl,
      imageLabel,
      documentName: typeof body.documentName === 'string' ? body.documentName.trim().slice(0, 180) : undefined,
      nearbyText: typeof body.nearbyText === 'string' ? body.nearbyText.trim().slice(0, 800) : undefined,
      page:
        typeof body.page === 'number' && Number.isInteger(body.page) && body.page >= 1 && body.page <= MAX_PAGE
          ? body.page
          : undefined
    }
  };
}

export async function POST(request: NextRequest) {
  const deadline = createRequestDeadline(maxDuration, DEADLINE_SAFETY_MARGIN_MS);
  const log = startRequestLog(request, ROUTE);

  try {
    return await handle(request, deadline, log);
  } catch (error) {
    log.finish({ status: 500, code: 'internal_error', detail: error instanceof Error ? error.name : undefined });
    return jsonError(500, 'internal_error', { error: 'Failed to generate alt-text recommendation.' });
  }
}

async function handle(request: NextRequest, deadline: RequestDeadline, log: RequestLog): Promise<Response> {
  const refused = guardApiRequest(request, ROUTE, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (refused) {
    log.finish({ status: refused.status, code: refused.status === 429 ? 'rate_limited' : 'cross_site' });
    return refused;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    log.finish({ status: 503, code: 'not_configured', detail: 'LITELLM_API_KEY / TRITONAI_API_KEY is not set.' });
    return jsonError(503, 'not_configured', { error: 'Alt-text suggestions are not available on this deployment.' });
  }

  const baseUrl = getBaseUrl();
  try {
    assertServiceUrlSafe(baseUrl, 'LITELLM_BASE_URL');
  } catch (error) {
    log.finish({ status: 500, code: 'misconfigured', detail: error instanceof Error ? error.message : undefined });
    return jsonError(500, 'misconfigured', { error: 'Alt-text suggestions are misconfigured on this deployment.' });
  }

  if (contentLengthExceeds(request, MAX_BODY_BYTES)) {
    log.finish({ status: 413, code: 'payload_too_large' });
    return jsonError(413, 'payload_too_large', { error: 'The image is too large to describe.' });
  }

  const parsed = normalizeBody(await request.json().catch(() => null));
  if (parsed && 'tooLarge' in parsed) {
    log.finish({ status: 413, code: 'payload_too_large' });
    return jsonError(413, 'payload_too_large', { error: 'The image is too large to describe.' });
  }
  if (!parsed) {
    log.finish({ status: 400, code: 'invalid_request' });
    return jsonError(400, 'invalid_request', { error: 'Expected imageDataUrl and imageLabel fields.' });
  }
  const { input } = parsed;

  const perModelTimeoutMs = getTimeoutMs();
  const failures: Failure[] = [];
  let usage: TokenUsage | undefined;
  const onUsage = (next: TokenUsage) => {
    usage = addTokenUsage(usage, next);
  };

  for (const model of getModelCandidates()) {
    const timeoutMs = deadline.attemptTimeoutMs(perModelTimeoutMs);
    // Too little time left for another model: answer now instead of letting
    // the platform end the function mid-request.
    if (timeoutMs === undefined) break;

    try {
      const suggestion = await requestTritonAiAltText(input, {
        apiKey,
        baseUrl,
        model,
        signal: AbortSignal.timeout(timeoutMs),
        onUsage
      });

      log.finish({ status: 200, model, attempts: failures.length + 1, failures, usage });
      return NextResponse.json(suggestion, {
        status: 200,
        headers: {
          'cache-control': 'no-store'
        }
      });
    } catch (error) {
      if (error instanceof TritonAiRequestError) {
        failures.push({ model, status: error.status });
      } else if (isTimeoutError(error)) {
        failures.push({ model, status: 504 });
      } else {
        failures.push({ model });
      }
    }
  }

  // Upstream detail can name internal deployments or echo the request, so
  // only model names and statuses are logged and returned.
  const allTimedOut = failures.length > 0 && failures.every((failure) => failure.status === 504);
  const allAuthRejected =
    failures.length > 0 && failures.every((failure) => failure.status === 401 || failure.status === 403);
  const authRejected = failures.some((failure) => failure.status === 401 || failure.status === 403);
  const code = allTimedOut ? 'upstream_timeout' : allAuthRejected ? 'upstream_auth' : 'upstream_error';
  const status = allTimedOut ? 504 : 502;

  log.finish({ status, code, attempts: failures.length, failures, usage });

  return jsonError(status, code, {
    error: allTimedOut ? 'TritonAI alt-text request timed out.' : 'Failed to generate alt-text recommendation.',
    hint: authRejected ? 'TritonAI rejected the configured API key.' : 'All configured TritonAI alt-text models failed.',
    attemptedModels: failures.map((failure) => ({
      model: failure.model,
      status: failure.status
    }))
  });
}
