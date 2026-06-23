import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { validateImageDataUrl } from '@/lib/alt-text/tritonai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const DEFAULT_LITELLM_BASE_URL = 'https://tritonai-api.ucsd.edu';
const DEFAULT_OCR_MODEL = 'api-lightonocr-1b';
const DEFAULT_OCR_FALLBACK_MODELS = ['api-mistral-small-3.2-2506', 'api-gemma-4-26b'];
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_LINES = 120;
const MAX_LINE_LENGTH = 240;

interface OcrLine {
  text: string;
}

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
    `Document: ${documentName?.trim() || 'uploaded PDF'}`,
    `Page: ${page}`,
    language?.trim() ? `Language hint: ${language.trim()}` : undefined,
    '',
    'Return JSON only with a top-level "lines" array. Each line item must be an object with a "text" string.'
  ]
    .filter(Boolean)
    .join('\n');
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
  return uniqueValues([configured, ...fallbackModels]);
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

  const apiKey = process.env.OCR_LITELLM_API_KEY || process.env.LITELLM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'TritonAI OCR is not configured (set OCR_LITELLM_API_KEY or LITELLM_API_KEY).' },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const imageDataUrl = validateImageDataUrl(body?.imageDataUrl);
  const page = Number(body?.page);
  const documentName = typeof body?.documentName === 'string' ? body.documentName : undefined;
  const language = typeof body?.language === 'string' ? body.language : undefined;

  if (!imageDataUrl || !Number.isFinite(page) || page < 1) {
    return NextResponse.json({ error: 'Expected imageDataUrl and page.' }, { status: 400 });
  }

  const baseUrl = (process.env.OCR_LITELLM_BASE_URL || process.env.LITELLM_BASE_URL || DEFAULT_LITELLM_BASE_URL).replace(/\/+$/, '');
  const models = getModelCandidates();
  const failures: Array<{ model: string; status?: number; message: string }> = [];

  for (const model of models) {
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
      cache: 'no-store'
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      failures.push({
        model,
        status: response.status,
        message: detail ? detail.slice(0, 300) : `HTTP ${response.status}`
      });
      continue;
    }

    const payload = await response.json().catch(() => null);
    try {
      const lines = parseOcrResponse(payload?.choices?.[0]?.message?.content);
      return NextResponse.json({
        model,
        lines,
        text: lines.map((line) => line.text).join('\n')
      });
    } catch (error) {
      failures.push({
        model,
        status: 502,
        message: error instanceof Error ? error.message : 'TritonAI OCR returned unusable text.'
      });
    }
  }

  console.warn('TritonAI OCR failed for one page with all model candidates', failures);

  return NextResponse.json(
    {
      warning: 'TritonAI OCR could not extract usable text for this page.',
      lines: [],
      text: '',
      attemptedModels: failures.map((failure) => ({
        model: failure.model,
        status: failure.status
      }))
    },
    { status: 200 }
  );
}
