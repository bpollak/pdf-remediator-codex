import { NextRequest, NextResponse } from 'next/server';
import { guardApiRequest, assertServiceUrlSafe, upstreamErrorStatus } from '@/lib/rate-limit';
import { DEFAULT_OCR_TIMEOUT_MS, MAX_OCR_TIMEOUT_MS } from '@/lib/ocr/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function getConfiguredTimeoutMs(): number {
  const raw = Number(process.env.OCR_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_OCR_TIMEOUT_MS;
  return Math.min(raw, MAX_OCR_TIMEOUT_MS);
}

export async function POST(request: NextRequest) {
  const refused = guardApiRequest(request, 'ocr', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (refused) return refused;
  const serviceUrl = process.env.OCR_SERVICE_URL;
  if (!serviceUrl) {
    return NextResponse.json(
      { error: 'OCR service is not configured (set OCR_SERVICE_URL).' },
      { status: 503 }
    );
  }

  try {
    assertServiceUrlSafe(serviceUrl, 'OCR_SERVICE_URL');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid OCR_SERVICE_URL configuration.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');
  const language = formData?.get('language');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Expected multipart field "file".' }, { status: 400 });
  }

  const fileName = file.name?.trim() || 'document.pdf';
  if (!fileName.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF uploads are supported for OCR.' }, { status: 400 });
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
      return NextResponse.json(
        {
          error: `OCR backend failed with status ${upstream.status}.`,
          ...(process.env.NODE_ENV === 'development' ? { detail: message.slice(0, 500) } : {})
        },
        { status: upstreamErrorStatus(upstream.status) }
      );
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    const contentLength = upstream.headers.get('content-length');
    if (!upstream.body || contentLength === '0') {
      return NextResponse.json({ error: 'OCR backend returned an empty response.' }, { status: 502 });
    }
    if (contentType && !contentType.toLowerCase().includes('application/pdf')) {
      return NextResponse.json({ error: 'OCR backend did not return a PDF.' }, { status: 502 });
    }

    // Stream the PDF through instead of buffering it: OCR output is often
    // larger than the upload, and buffered function responses are size-capped.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'cache-control': 'no-store',
        ...(contentLength ? { 'content-length': contentLength } : {})
      }
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: 'OCR request timed out.' }, { status: 504 });
    }
    return NextResponse.json(
      {
        error: 'Failed to contact OCR backend.',
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
