import type { NextRequest } from 'next/server';
import { guardApiRequest, assertServiceUrlSafe, upstreamErrorStatus } from '@/lib/rate-limit';
import { DEFAULT_OCR_TIMEOUT_MS, MAX_OCR_TIMEOUT_MS } from '@/lib/ocr/config';
import { contentLengthExceeds, jsonError, PLATFORM_MAX_BODY_BYTES, upstreamErrorCode } from '@/lib/server/http';
import { startRequestLog, type RequestLog } from '@/lib/server/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const ROUTE = 'ocr';
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function getConfiguredTimeoutMs(): number {
  const raw = Number(process.env.OCR_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_OCR_TIMEOUT_MS;
  return Math.min(raw, MAX_OCR_TIMEOUT_MS);
}

/**
 * Passes the upstream body through and calls `done` exactly once when it
 * finishes, fails or is cancelled by the client. The upstream timeout stays
 * armed until then, so a backend that stalls mid-body is still aborted.
 */
function releaseWhenFinished(
  body: ReadableStream<Uint8Array>,
  done: (outcome: 'finished' | 'failed' | 'cancelled') => void
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let released = false;
  const release = (outcome: 'finished' | 'failed' | 'cancelled') => {
    if (released) return;
    released = true;
    done(outcome);
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done: finished, value } = await reader.read();
        if (finished) {
          release('finished');
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        release('failed');
        controller.error(error);
      }
    },
    cancel(reason) {
      release('cancelled');
      return reader.cancel(reason);
    }
  });
}

export async function POST(request: NextRequest) {
  const log = startRequestLog(request, ROUTE);
  try {
    return await handle(request, log);
  } catch (error) {
    log.finish({ status: 500, code: 'internal_error', detail: error instanceof Error ? error.name : undefined });
    return jsonError(500, 'internal_error', { error: 'OCR request failed.' });
  }
}

async function handle(request: NextRequest, log: RequestLog): Promise<Response> {
  const refused = guardApiRequest(request, ROUTE, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (refused) {
    log.finish({ status: refused.status, code: refused.status === 429 ? 'rate_limited' : 'cross_site' });
    return refused;
  }
  const serviceUrl = process.env.OCR_SERVICE_URL;
  if (!serviceUrl) {
    log.finish({ status: 503, code: 'not_configured', detail: 'OCR_SERVICE_URL is not set.' });
    return jsonError(503, 'not_configured', { error: 'OCR service is not configured.' });
  }

  try {
    assertServiceUrlSafe(serviceUrl, 'OCR_SERVICE_URL');
  } catch (err) {
    log.finish({ status: 500, code: 'misconfigured', detail: err instanceof Error ? err.message : undefined });
    return jsonError(500, 'misconfigured', { error: 'OCR service is misconfigured.' });
  }

  if (contentLengthExceeds(request, PLATFORM_MAX_BODY_BYTES)) {
    log.finish({ status: 413, code: 'payload_too_large' });
    return jsonError(413, 'payload_too_large', { error: 'This file is too large for the OCR service.' });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');
  const language = formData?.get('language');

  if (!(file instanceof File)) {
    log.finish({ status: 400, code: 'invalid_request' });
    return jsonError(400, 'invalid_request', { error: 'Expected multipart field "file".' });
  }

  const fileName = file.name?.trim() || 'document.pdf';
  if (!fileName.toLowerCase().endsWith('.pdf')) {
    log.finish({ status: 400, code: 'invalid_request' });
    return jsonError(400, 'invalid_request', { error: 'Only PDF uploads are supported for OCR.' });
  }

  const upstreamForm = new FormData();
  upstreamForm.append('file', file, fileName);
  if (typeof language === 'string' && language.trim()) {
    upstreamForm.append('language', language.trim());
  }

  const headers = new Headers();
  if (process.env.OCR_SERVICE_TOKEN) {
    headers.set('Authorization', `Bearer ${process.env.OCR_SERVICE_TOKEN}`);
  }
  if (process.env.OCR_SERVICE_API_KEY) {
    headers.set('x-api-key', process.env.OCR_SERVICE_API_KEY);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getConfiguredTimeoutMs());
  // Set once the body is handed to the client; the stream then owns the timer.
  let streaming = false;

  try {
    const upstream = await fetch(serviceUrl, {
      method: 'POST',
      body: upstreamForm,
      headers,
      signal: controller.signal,
      cache: 'no-store'
    });

    if (!upstream.ok) {
      const message = await upstream.text().catch(() => '');
      const status = upstreamErrorStatus(upstream.status);
      const code = upstreamErrorCode(upstream.status);
      log.finish({ status, code, detail: `OCR backend returned ${upstream.status}.` });
      return jsonError(status, code, {
        error: `OCR backend failed with status ${upstream.status}.`,
        ...(process.env.NODE_ENV === 'development' ? { detail: message.slice(0, 500) } : {})
      });
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    if (!upstream.body || upstream.headers.get('content-length') === '0') {
      log.finish({ status: 502, code: 'upstream_error', detail: 'OCR backend returned an empty response.' });
      return jsonError(502, 'upstream_error', { error: 'OCR backend returned an empty response.' });
    }
    if (contentType && !contentType.toLowerCase().includes('application/pdf')) {
      await upstream.body.cancel().catch(() => undefined);
      log.finish({ status: 502, code: 'upstream_error', detail: 'OCR backend did not return a PDF.' });
      return jsonError(502, 'upstream_error', { error: 'OCR backend did not return a PDF.' });
    }

    // Stream the PDF through instead of buffering it: OCR output is often
    // larger than the upload, and buffered function responses are size-capped.
    // No content-length: fetch may have decoded a compressed upstream body,
    // so the upstream length need not match what is sent on.
    streaming = true;
    const body = releaseWhenFinished(upstream.body, (outcome) => {
      clearTimeout(timer);
      if (outcome === 'failed') {
        log.finish({
          status: 200,
          code: controller.signal.aborted ? 'upstream_timeout' : 'upstream_error',
          detail: 'OCR backend body did not complete.'
        });
      } else {
        log.finish({ status: 200, detail: outcome === 'cancelled' ? 'Client cancelled the download.' : undefined });
      }
    });
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'cache-control': 'no-store'
      }
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      log.finish({ status: 504, code: 'upstream_timeout' });
      return jsonError(504, 'upstream_timeout', { error: 'OCR request timed out.' });
    }
    log.finish({ status: 502, code: 'upstream_error', detail: 'Failed to contact OCR backend.' });
    return jsonError(502, 'upstream_error', {
      error: 'Failed to contact OCR backend.',
      ...(process.env.NODE_ENV === 'development'
        ? { detail: error instanceof Error ? error.message : 'Unknown error' }
        : {})
    });
  } finally {
    if (!streaming) clearTimeout(timer);
  }
}
