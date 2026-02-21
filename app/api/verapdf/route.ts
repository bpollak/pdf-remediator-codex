import { NextRequest, NextResponse } from 'next/server';
import { normalizeVerapdfPayload } from '@/lib/verapdf/normalize';
import type { VerapdfResult } from '@/lib/verapdf/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DEFAULT_VERAPDF_TIMEOUT_MS = 120_000;
const DEFAULT_VERAPDF_PROFILE = 'ua1';

function getConfiguredTimeoutMs(): number {
  const raw = Number(process.env.VERAPDF_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_VERAPDF_TIMEOUT_MS;
  return Math.min(raw, 600_000);
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

export async function POST(request: NextRequest) {
  const serviceUrl = process.env.VERAPDF_SERVICE_URL;
  if (!serviceUrl) {
    return NextResponse.json(
      { attempted: false, reason: 'veraPDF service is not configured (set VERAPDF_SERVICE_URL).' },
      { status: 503 }
    );
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Expected multipart field "file".' }, { status: 400 });
  }

  const fileName = file.name?.trim() || 'document.pdf';
  if (!fileName.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF uploads are supported for veraPDF verification.' }, { status: 400 });
  }

  const profile = getConfiguredProfile();
  let upstreamUrl: string;
  try {
    upstreamUrl = resolveValidationUrl(serviceUrl, profile);
  } catch {
    return NextResponse.json({ error: 'Invalid VERAPDF_SERVICE_URL configuration.' }, { status: 500 });
  }

  const upstreamForm = new FormData();
  upstreamForm.append('file', file, fileName);

  const headers = new Headers({
    Accept: 'application/json'
  });
  if (process.env.VERAPDF_SERVICE_TOKEN) {
    headers.set('Authorization', `Bearer ${process.env.VERAPDF_SERVICE_TOKEN}`);
  }
  if (process.env.VERAPDF_SERVICE_API_KEY) {
    headers.set('x-api-key', process.env.VERAPDF_SERVICE_API_KEY);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getConfiguredTimeoutMs());

  try {
    const upstream = await fetch(upstreamUrl, {
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
          error: `veraPDF backend failed with status ${upstream.status}.`,
          detail: message.slice(0, 500)
        },
        { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 }
      );
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    const reportPayload = await upstream.text();
    const normalized = normalizeVerapdfPayload(reportPayload, contentType);

    const result: VerapdfResult = {
      attempted: true,
      ...normalized
    };

    if (result.compliant === undefined && !result.reason) {
      result.reason = 'veraPDF response did not include a compliance verdict.';
    }

    return NextResponse.json(result, {
      status: 200,
      headers: {
        'cache-control': 'no-store'
      }
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ attempted: true, reason: 'veraPDF request timed out.' }, { status: 504 });
    }
    return NextResponse.json(
      {
        attempted: true,
        reason: 'Failed to contact veraPDF backend.',
        detail: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}
