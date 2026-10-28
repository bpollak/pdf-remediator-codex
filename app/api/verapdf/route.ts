import { NextRequest, NextResponse } from 'next/server';
import { normalizeVerapdfPayload } from '@/lib/verapdf/normalize';
import { guardApiRequest, assertServiceUrlSafe, upstreamErrorStatus } from '@/lib/rate-limit';
import {
  contentLengthExceeds,
  jsonError,
  PLATFORM_MAX_BODY_BYTES,
  readTextCapped,
  upstreamErrorCode
} from '@/lib/server/http';
import { startRequestLog, type RequestLog } from '@/lib/server/log';
import type { VerapdfResult } from '@/lib/verapdf/types';
import {
  DEFAULT_VERAPDF_TIMEOUT_MS,
  MAX_VERAPDF_TIMEOUT_MS,
  VERAPDF_WARMUP_TIMEOUT_MS
} from '@/lib/verapdf/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js only recognizes route config exports when they are static literals.
export const maxDuration = 300;

const DEFAULT_VERAPDF_PROFILE = 'ua1';
const DEFAULT_LOCAL_VERAPDF_URL = 'http://127.0.0.1:8081';
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
// A veraPDF JSON report for a large, badly tagged PDF can be big, but nothing
// legitimate comes near this; past it the backend is misbehaving.
const MAX_REPORT_BYTES = 10 * 1024 * 1024;

function getConfiguredTimeoutMs(): number {
  const raw = Number(process.env.VERAPDF_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_VERAPDF_TIMEOUT_MS;
  return Math.min(raw, MAX_VERAPDF_TIMEOUT_MS);
}

function getConfiguredProfile(): string {
  const raw = process.env.VERAPDF_VALIDATION_PROFILE?.trim();
  return raw || DEFAULT_VERAPDF_PROFILE;
}

function resolveValidationUrl(serviceUrl: string, profile: string): string {
  const parsed = new URL(serviceUrl);
  const normalizedPath = parsed.pathname.replace(/\/+$/, '');
  const encodedProfile = encodeURIComponent(profile);

  if (/\/api\/validate\/[^/]+$/i.test(normalizedPath)) {
    parsed.pathname = normalizedPath;
    return parsed.toString();
  }

  if (/\/api\/validate$/i.test(normalizedPath)) {
    parsed.pathname = `${normalizedPath}/${encodedProfile}`;
    return parsed.toString();
  }

  parsed.pathname = `${normalizedPath}/api/validate/${encodedProfile}`.replace(/\/{2,}/g, '/');
  return parsed.toString();
}

function resolveServiceUrl(): { url?: string; source: 'env' | 'dev-default' | 'none' } {
  const configured = process.env.VERAPDF_SERVICE_URL?.trim();
  if (configured) return { url: configured, source: 'env' };

  if (process.env.NODE_ENV === 'development') {
    return { url: DEFAULT_LOCAL_VERAPDF_URL, source: 'dev-default' };
  }

  return { source: 'none' };
}

function notConfiguredReason(): string {
  if (process.env.NODE_ENV === 'development') {
    return 'veraPDF service is not configured. In development, run docker compose -f docker-compose.verapdf.yml up -d.';
  }
  return 'veraPDF verification is not enabled for this deployment.';
}

function refusedCode(response: Response): 'rate_limited' | 'cross_site' {
  return response.status === 429 ? 'rate_limited' : 'cross_site';
}

function resolveInfoUrl(serviceUrl: string): string {
  const parsed = new URL(serviceUrl);
  const normalizedPath = parsed.pathname.replace(/\/+$/, '');

  if (/\/api\/info$/i.test(normalizedPath)) return parsed.toString();
  if (/\/api\/validate(?:\/[^/]+)?$/i.test(normalizedPath)) {
    parsed.pathname = normalizedPath.replace(/\/validate(?:\/[^/]+)?$/i, '/info');
    return parsed.toString();
  }

  parsed.pathname = `${normalizedPath}/api/info`.replace(/\/{2,}/g, '/');
  return parsed.toString();
}

function serviceAuthHeaders(headers = new Headers()): Headers {
  if (process.env.VERAPDF_SERVICE_TOKEN) {
    headers.set('Authorization', `Bearer ${process.env.VERAPDF_SERVICE_TOKEN}`);
  }
  if (process.env.VERAPDF_SERVICE_API_KEY) {
    headers.set('x-api-key', process.env.VERAPDF_SERVICE_API_KEY);
  }
  return headers;
}

async function probeVerapdf(serviceUrl: string, timeoutMs = 3_000): Promise<boolean> {
  const infoUrl = resolveInfoUrl(serviceUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(infoUrl, {
      method: 'GET',
      headers: serviceAuthHeaders(),
      signal: controller.signal,
      cache: 'no-store'
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  const log = startRequestLog(request, 'verapdf-status');
  const refused = guardApiRequest(request, 'verapdf-status', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (refused) {
    log.finish({ status: refused.status, code: refusedCode(refused) });
    return refused;
  }

  const profile = getConfiguredProfile();
  const resolved = resolveServiceUrl();
  const serviceUrl = resolved.url;

  if (!serviceUrl) {
    log.finish({ status: 503, code: 'not_configured', detail: 'VERAPDF_SERVICE_URL is not set.' });
    return jsonError(503, 'not_configured', {
      configured: false,
      reachable: false,
      source: resolved.source,
      profile,
      reason: notConfiguredReason()
    });
  }

  let reachable = false;
  try {
    assertServiceUrlSafe(serviceUrl, 'VERAPDF_SERVICE_URL');
    reachable = await probeVerapdf(serviceUrl);
  } catch {
    reachable = false;
  }

  log.finish({ status: reachable ? 200 : 503, ...(reachable ? {} : { code: 'upstream_error' }) });
  return NextResponse.json(
    {
      configured: true,
      reachable,
      source: resolved.source,
      profile
    },
    { status: reachable ? 200 : 503 }
  );
}

export async function POST(request: NextRequest) {
  const log = startRequestLog(request, 'verapdf');
  try {
    return await handlePost(request, log);
  } catch (error) {
    log.finish({ status: 500, code: 'internal_error', detail: error instanceof Error ? error.name : undefined });
    return jsonError(500, 'internal_error', { attempted: true, reason: 'veraPDF verification failed.' });
  }
}

async function handlePost(request: NextRequest, log: RequestLog): Promise<Response> {
  const refused = guardApiRequest(request, 'verapdf', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (refused) {
    log.finish({ status: refused.status, code: refusedCode(refused) });
    return refused;
  }

  const resolved = resolveServiceUrl();
  const serviceUrl = resolved.url;
  if (!serviceUrl) {
    log.finish({ status: 503, code: 'not_configured', detail: 'VERAPDF_SERVICE_URL is not set.' });
    return jsonError(503, 'not_configured', {
      attempted: false,
      reason: notConfiguredReason()
    });
  }

  if (contentLengthExceeds(request, PLATFORM_MAX_BODY_BYTES)) {
    log.finish({ status: 413, code: 'payload_too_large' });
    return jsonError(413, 'payload_too_large', {
      attempted: false,
      reason: 'This file is too large for veraPDF verification on this deployment.'
    });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');

  if (!(file instanceof File)) {
    log.finish({ status: 400, code: 'invalid_request' });
    return jsonError(400, 'invalid_request', { error: 'Expected multipart field "file".' });
  }

  const fileName = file.name?.trim() || 'document.pdf';
  if (!fileName.toLowerCase().endsWith('.pdf')) {
    log.finish({ status: 400, code: 'invalid_request' });
    return jsonError(400, 'invalid_request', { error: 'Only PDF uploads are supported for veraPDF verification.' });
  }

  const profile = getConfiguredProfile();
  let upstreamUrl: string;
  try {
    assertServiceUrlSafe(serviceUrl, 'VERAPDF_SERVICE_URL');
    upstreamUrl = resolveValidationUrl(serviceUrl, profile);
  } catch (err) {
    log.finish({ status: 500, code: 'misconfigured', detail: err instanceof Error ? err.message : undefined });
    return jsonError(500, 'misconfigured', { error: 'veraPDF service is misconfigured.' });
  }

  const upstreamForm = new FormData();
  upstreamForm.append('file', file, fileName);

  const headers = serviceAuthHeaders(new Headers({ Accept: 'application/json' }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getConfiguredTimeoutMs());

  try {
    if (resolved.source === 'env') {
      // Render-backed veraPDF can hibernate; warming it first avoids the
      // validation request paying the cold-start penalty.
      await probeVerapdf(serviceUrl, VERAPDF_WARMUP_TIMEOUT_MS).catch(() => false);
    }

    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      body: upstreamForm,
      headers,
      signal: controller.signal,
      cache: 'no-store'
    });

    if (!upstream.ok) {
      const message = (await readTextCapped(upstream, 64 * 1024).catch(() => '')) ?? '';
      const status = upstreamErrorStatus(upstream.status);
      const code = upstreamErrorCode(upstream.status);
      log.finish({ status, code, detail: `veraPDF backend returned ${upstream.status}.` });
      return jsonError(status, code, {
        error: `veraPDF backend failed with status ${upstream.status}.`,
        ...(process.env.NODE_ENV === 'development' ? { detail: message.slice(0, 500) } : {})
      });
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    const reportPayload = await readTextCapped(upstream, MAX_REPORT_BYTES);
    if (reportPayload === undefined) {
      log.finish({ status: 502, code: 'upstream_error', detail: 'veraPDF report exceeded the size cap.' });
      return jsonError(502, 'upstream_error', {
        attempted: true,
        reason: 'veraPDF returned a report that was too large to read.'
      });
    }
    const normalized = normalizeVerapdfPayload(reportPayload, contentType);

    const result: VerapdfResult = {
      attempted: true,
      ...normalized
    };

    if (result.compliant === undefined && !result.reason) {
      result.reason = 'veraPDF response did not include a compliance verdict.';
    }

    log.finish({ status: 200 });
    return NextResponse.json(result, {
      status: 200,
      headers: {
        'cache-control': 'no-store'
      }
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      log.finish({ status: 504, code: 'upstream_timeout' });
      return jsonError(504, 'upstream_timeout', { attempted: true, reason: 'veraPDF request timed out.' });
    }
    log.finish({ status: 502, code: 'upstream_error', detail: 'Failed to contact veraPDF backend.' });
    return jsonError(502, 'upstream_error', {
      attempted: true,
      reason:
        resolved.source === 'dev-default'
          ? 'Failed to contact local veraPDF backend at http://127.0.0.1:8081. Start it with docker compose -f docker-compose.verapdf.yml up -d.'
          : 'Failed to contact veraPDF backend.',
      ...(process.env.NODE_ENV === 'development'
        ? { detail: error instanceof Error ? error.message : 'Unknown error' }
        : {})
    });
  } finally {
    clearTimeout(timer);
  }
}
