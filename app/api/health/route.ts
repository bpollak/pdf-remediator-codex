import type { NextRequest } from 'next/server';
import { assertServiceUrlSafe, guardApiRequest } from '@/lib/rate-limit';
import { startRequestLog } from '@/lib/server/log';
import { getAltTextGatewaySettings, getOcrGatewaySettings } from '@/lib/tritonai/gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = 'health';
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

function isUsableUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    assertServiceUrlSafe(url, 'service URL');
    return true;
  } catch {
    return false;
  }
}

function gatewayConfigured(settings: { apiKey?: string; baseUrl: string }): boolean {
  return Boolean(settings.apiKey) && isUsableUrl(settings.baseUrl);
}

/**
 * Which backend services this deployment is configured to use. Reads
 * configuration only: no outbound calls, and no URLs, keys or setting names
 * in the response.
 */
export async function GET(request: NextRequest) {
  const log = startRequestLog(request, ROUTE);
  const refused = guardApiRequest(request, ROUTE, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (refused) {
    log.finish({ status: refused.status, code: refused.status === 429 ? 'rate_limited' : 'cross_site' });
    return refused;
  }

  const verapdfUrl =
    process.env.VERAPDF_SERVICE_URL?.trim() ||
    // The veraPDF route falls back to a local container in development.
    (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8081' : undefined);
  const version = (process.env.APP_COMMIT_SHA?.trim() || process.env.VERCEL_GIT_COMMIT_SHA?.trim())?.slice(0, 7);

  log.finish({ status: 200 });
  return Response.json(
    {
      ok: true,
      services: {
        altText: gatewayConfigured(getAltTextGatewaySettings()),
        ocr: isUsableUrl(process.env.OCR_SERVICE_URL?.trim()),
        tritonAiOcr: gatewayConfigured(getOcrGatewaySettings()),
        verapdf: isUsableUrl(verapdfUrl)
      },
      ...(version ? { version } : {})
    },
    { status: 200, headers: { 'cache-control': 'no-store' } }
  );
}
