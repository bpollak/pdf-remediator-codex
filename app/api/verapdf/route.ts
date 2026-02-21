import { NextRequest, NextResponse } from 'next/server';
import { normalizeVerapdfPayload } from '@/lib/verapdf/normalize';
import type { VerapdfResult } from '@/lib/verapdf/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DEFAULT_VERAPDF_TIMEOUT_MS = 120_000;
const DEFAULT_VERAPDF_PROFILE = 'ua1';
const DEFAULT_LOCAL_VERAPDF_URL = 'http://127.0.0.1:8081';

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

function resolveServiceUrl(): { url?: string; source: 'env' | 'dev-default' | 'none' } {
  const configured = process.env.VERAPDF_SERVICE_URL?.trim();
  if (configured) return { url: configured, source: 'env' };

  if (process.env.NODE_ENV === 'development') {
    return { url: DEFAULT_LOCAL_VERAPDF_URL, source: 'dev-default' };
  }

  return { source: 'none' };
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

async function probeVerapdf(serviceUrl: string): Promise<boolean> {
  const infoUrl = resolveInfoUrl(serviceUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);

  try {
    const response = await fetch(infoUrl, {
      method: 'GET',
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

export async function GET() {
  const profile = getConfiguredProfile();
  const resolved = resolveServiceUrl();
  const serviceUrl = resolved.url;

  if (!serviceUrl) {
    return NextResponse.json(
      {
        configured: false,
        reachable: false,
        source: resolved.source,
        profile,
        reason: 'Set VERAPDF_SERVICE_URL, or run local docker-compose in development.'
      },
      { status: 503 }
    );
  }

  let reachable = false;
  try {
    reachable = await probeVerapdf(serviceUrl);
  } catch {
    reachable = false;
  }

  return NextResponse.json(
    {
      configured: true,
      reachable,
      source: resolved.source,
      profile,
      serviceUrl
    },
    { status: reachable ? 200 : 503 }
  );
}

export async function POST(request: NextRequest) {
  const resolved = resolveServiceUrl();
  const serviceUrl = resolved.url;
  if (!serviceUrl) {
    return NextResponse.json(
      {
        attempted: false,
        reason: 'veraPDF service is not configured (set VERAPDF_SERVICE_URL). In development, run docker compose -f docker-compose.verapdf.yml up -d.'
      },
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
        reason:
          resolved.source === 'dev-default'
            ? 'Failed to contact local veraPDF backend at http://127.0.0.1:8081. Start it with docker compose -f docker-compose.verapdf.yml up -d.'
            : 'Failed to contact veraPDF backend.',
        detail: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}
