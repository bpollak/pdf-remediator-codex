import { NextRequest, NextResponse } from 'next/server';
import { assertServiceUrlSafe, guardApiRequest } from '@/lib/rate-limit';
import { validateImageDataUrl } from '@/lib/alt-text/tritonai';
import { createRequestDeadline, type RequestDeadline } from '@/lib/server/deadline';
import { contentLengthExceeds, isTimeoutError, jsonError } from '@/lib/server/http';
import { addTokenUsage, readTokenUsage, startRequestLog, type RequestLog, type TokenUsage } from '@/lib/server/log';
import { formatUntrustedBlock, sanitizeUntrustedText } from '@/lib/tritonai/prompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const DEFAULT_LITELLM_BASE_URL = 'https://tritonai-api.ucsd.edu';
const DEFAULT_OCR_MODEL = 'api-lightonocr-1b';
const DEFAULT_OCR_FALLBACK_MODELS = ['api-mistral-small-3.2-2506', 'api-gemma-4-26b'];
const ROUTE = 'ocr-tritonai';
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_LINES = 120;
const MAX_LINE_LENGTH = 240;
const MIN_CONFIDENT_PAGE_LINES = 2;
// Each model gets its own time budget so a stalled primary still leaves room
// for the fallbacks, and every attempt is also capped by what is left of the
// request deadline.
const PER_MODEL_TIMEOUT_MS = 35_000;
// Leaves time to build the JSON answer before maxDuration ends the function.
const DEADLINE_SAFETY_MARGIN_MS = 5_000;
const MAX_MODEL_CANDIDATES = 3;
// A page rendered at the client's OCR scale is well under this; larger
// bodies are near the platform's 4.5 MB request cap anyway.
const MAX_IMAGE_DATA_URL_LENGTH = 3_500_000;
const MAX_BODY_BYTES = MAX_IMAGE_DATA_URL_LENGTH + 64 * 1024;
const MAX_PAGE = 10_000;

interface OcrLine {
  text: string;
}

function stripJsonFences(value: string): string {
  const trimmed = value.trim();
  const fence = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return (fence ? fence[1] : trimmed).trim();
}

function normalizeLine(value: unknown): OcrLine | undefined {
  const raw = typeof value === 'string' ? value : value && typeof value === 'object' ? (value as Record<string, unknown>).text : '';
  if (typeof raw !== 'string') return undefined;
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE_LENGTH);
  if (!text || text.length < 2) return undefined;
  return { text };
}

function parseOcrResponse(content: unknown): OcrLine[] {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('TritonAI returned an empty OCR response.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFences(content));
  } catch {
    const lines = content
      .split(/\r?\n/)
      .map(normalizeLine)
      .filter((line): line is OcrLine => Boolean(line));
    if (lines.length) return lines.slice(0, MAX_LINES);
    throw new Error('TritonAI returned OCR text that could not be parsed.');
  }

  const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const rawLines = Array.isArray(record.lines)
    ? record.lines
    : typeof record.text === 'string'
      ? record.text.split(/\r?\n/)
      : [];
  const lines = rawLines.map(normalizeLine).filter((line): line is OcrLine => Boolean(line));

  if (!lines.length) {
    throw new Error('TritonAI did not return usable OCR text.');
  }

  return lines.slice(0, MAX_LINES);
}

function buildOcrPrompt(page: number, documentName?: string, language?: string) {
  return [
    'Extract the visible text from this PDF page image for OCR.',
    'Extract every readable text line across the whole page, including headings, body text, labels, captions, headers, and footers.',
    'Return only text that is actually visible on the page.',
    'Preserve reading order as separate lines.',
    'Do not stop after the first title, heading, or text block.',
    'Do not summarize, correct, translate, describe the page, or invent sample text.',
    '',
    formatUntrustedBlock([
      ['Document', documentName ?? 'uploaded PDF'],
      ['Page', page],
      ['Language hint', language]
    ]),
    '',
    'Return JSON only with a top-level "lines" array. Each line item must be an object with a "text" string.'
  ].join('\n');
}

function buildTritonOcrRequest(input: {
  imageDataUrl: string;
  page: number;
  documentName?: string;
  language?: string;
  model: string;
}) {
  return {
    model: input.model,
    messages: [
      {
        role: 'system',
        content: 'You are an OCR engine. Extract visible page text only and return strict JSON.'
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildOcrPrompt(input.page, input.documentName, input.language)
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
    max_tokens: 1800,
    response_format: { type: 'json_object' }
  };
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
  const configured = process.env.OCR_LITELLM_MODEL || DEFAULT_OCR_MODEL;
  const fallbackModels = process.env.OCR_LITELLM_FALLBACK_MODELS
    ? process.env.OCR_LITELLM_FALLBACK_MODELS.split(',')
    : DEFAULT_OCR_FALLBACK_MODELS;
  return uniqueValues([configured, ...fallbackModels]).slice(0, MAX_MODEL_CANDIDATES);
}


type Failure = { model: string; status?: number };

export async function POST(request: NextRequest) {
  const deadline = createRequestDeadline(maxDuration, DEADLINE_SAFETY_MARGIN_MS);
  const log = startRequestLog(request, ROUTE);

  try {
    return await handle(request, deadline, log);
  } catch (error) {
    log.finish({ status: 500, code: 'internal_error', detail: error instanceof Error ? error.name : undefined });
    return jsonError(500, 'internal_error', { error: 'TritonAI OCR failed for this page.' });
  }
}

async function handle(request: NextRequest, deadline: RequestDeadline, log: RequestLog): Promise<Response> {
  const refused = guardApiRequest(request, ROUTE, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (refused) {
    log.finish({ status: refused.status, code: refused.status === 429 ? 'rate_limited' : 'cross_site' });
    return refused;
  }

  const apiKey = process.env.OCR_LITELLM_API_KEY || process.env.LITELLM_API_KEY;
  if (!apiKey) {
    log.finish({ status: 503, code: 'not_configured', detail: 'OCR_LITELLM_API_KEY / LITELLM_API_KEY is not set.' });
    return jsonError(503, 'not_configured', { error: 'TritonAI OCR is not available on this deployment.' });
  }

  const baseUrl = (process.env.OCR_LITELLM_BASE_URL || process.env.LITELLM_BASE_URL || DEFAULT_LITELLM_BASE_URL).replace(/\/+$/, '');
  try {
    assertServiceUrlSafe(baseUrl, process.env.OCR_LITELLM_BASE_URL ? 'OCR_LITELLM_BASE_URL' : 'LITELLM_BASE_URL');
  } catch (error) {
    log.finish({ status: 500, code: 'misconfigured', detail: error instanceof Error ? error.message : undefined });
    return jsonError(500, 'misconfigured', { error: 'TritonAI OCR is misconfigured on this deployment.' });
  }

  if (contentLengthExceeds(request, MAX_BODY_BYTES)) {
    log.finish({ status: 413, code: 'payload_too_large' });
    return jsonError(413, 'payload_too_large', { error: 'This page image is too large for TritonAI OCR.' });
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.imageDataUrl === 'string' && body.imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    log.finish({ status: 413, code: 'payload_too_large' });
    return jsonError(413, 'payload_too_large', { error: 'This page image is too large for TritonAI OCR.' });
  }

  const imageDataUrl = validateImageDataUrl(body?.imageDataUrl);
  const page = body?.page;
  // Both fields come from the browser and go into the prompt.
  const documentName = sanitizeUntrustedText(body?.documentName, 180);
  const language = sanitizeUntrustedText(body?.language, 32);

  if (!imageDataUrl || typeof page !== 'number' || !Number.isInteger(page) || page < 1 || page > MAX_PAGE) {
    log.finish({ status: 400, code: 'invalid_request' });
    return jsonError(400, 'invalid_request', { error: 'Expected imageDataUrl and page.' });
  }

  const models = getModelCandidates();
  const failures: Failure[] = [];
  let bestResult: { model: string; lines: OcrLine[] } | undefined;
  let usage: TokenUsage | undefined;

  for (const model of models) {
    const timeoutMs = deadline.attemptTimeoutMs(PER_MODEL_TIMEOUT_MS);
    // Too little time left for another model: answer now instead of letting
    // the platform end the function mid-request.
    if (timeoutMs === undefined) break;

    let payload: unknown;
    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(
          buildTritonOcrRequest({
            imageDataUrl,
            page,
            documentName,
            language,
            model
          })
        ),
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!response.ok) {
        // The body can name internal deployments; drop it and keep only the status.
        await response.body?.cancel().catch(() => undefined);
        failures.push({ model, status: response.status });
        continue;
      }

      payload = await response.json().catch((error: unknown) => {
        if (isTimeoutError(error)) throw error;
        return null;
      });
    } catch (error) {
      failures.push({ model, status: isTimeoutError(error) ? 504 : 502 });
      continue;
    }

    usage = addTokenUsage(usage, readTokenUsage(payload));
    try {
      const choices = (payload as { choices?: Array<{ message?: { content?: unknown } }> } | null)?.choices;
      const lines = parseOcrResponse(choices?.[0]?.message?.content);
      if (!bestResult || lines.length > bestResult.lines.length) {
        bestResult = { model, lines };
      }
      if (lines.length >= MIN_CONFIDENT_PAGE_LINES) {
        log.finish({ status: 200, model, attempts: failures.length + 1, failures, usage });
        return NextResponse.json({
          model,
          lines,
          text: lines.map((line) => line.text).join('\n')
        });
      }
      // Limited text: try the fallback models.
      failures.push({ model, status: 206 });
    } catch {
      failures.push({ model, status: 502 });
    }
  }

  const attemptedModels = failures.map((failure) => ({
    model: failure.model,
    status: failure.status
  }));

  if (bestResult) {
    log.finish({ status: 200, model: bestResult.model, attempts: failures.length, failures, usage });
    return NextResponse.json({
      model: bestResult.model,
      warning: `TritonAI OCR returned limited text (${bestResult.lines.length} line${bestResult.lines.length === 1 ? '' : 's'}).`,
      lines: bestResult.lines,
      text: bestResult.lines.map((line) => line.text).join('\n'),
      attemptedModels
    });
  }

  const allAuthRejected =
    failures.length > 0 && failures.every((failure) => failure.status === 401 || failure.status === 403);
  if (allAuthRejected) {
    // A credentials problem is a deployment fault, not "this page has no text".
    log.finish({ status: 502, code: 'upstream_auth', attempts: failures.length, failures });
    return jsonError(502, 'upstream_auth', {
      error: "The OCR service rejected the app's credentials.",
      attemptedModels
    });
  }

  const allTimedOut = failures.length > 0 && failures.every((failure) => failure.status === 504);
  if (allTimedOut) {
    log.finish({ status: 504, code: 'upstream_timeout', attempts: failures.length, failures });
    return jsonError(504, 'upstream_timeout', { error: 'TritonAI OCR request timed out.', attemptedModels });
  }

  log.finish({ status: 200, attempts: failures.length, failures, usage });
  return NextResponse.json(
    {
      warning: 'TritonAI OCR could not extract usable text for this page.',
      lines: [],
      text: '',
      attemptedModels
    },
    { status: 200 }
  );
}
