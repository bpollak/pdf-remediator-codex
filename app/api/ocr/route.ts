import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DEFAULT_OCR_TIMEOUT_MS = 240_000;

function getConfiguredTimeoutMs(): number {
  const raw = Number(process.env.OCR_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_OCR_TIMEOUT_MS;
  return Math.min(raw, 600_000);
}

export async function POST(request: NextRequest) {
  const serviceUrl = process.env.OCR_SERVICE_URL;
  if (!serviceUrl) {
    return NextResponse.json(
      { error: 'OCR service is not configured (set OCR_SERVICE_URL).' },
      { status: 503 }
    );
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
          detail: message.slice(0, 500)
        },
        { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 }
      );
    }

    const outputBytes = await upstream.arrayBuffer();
    if (!outputBytes.byteLength) {
      return NextResponse.json({ error: 'OCR backend returned an empty response.' }, { status: 502 });
    }

    return new Response(outputBytes, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'cache-control': 'no-store'
      }
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: 'OCR request timed out.' }, { status: 504 });
    }
    return NextResponse.json(
      {
        error: 'Failed to contact OCR backend.',
        detail: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}
