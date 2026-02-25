import type { RemediationMode } from '@/lib/pdf/types';

export const MANIFEST_PREFIX = 'AccessiblePDFManifest=';

export interface RemediationManifest {
  version?: number;
  language?: string;
  pdfUaPart?: string;
  remediationMode?: RemediationMode;
}

export function encodeManifest(manifest: RemediationManifest): string {
  return `${MANIFEST_PREFIX}${encodeURIComponent(JSON.stringify(manifest))}`;
}

function extractEncodedManifest(value: string): string | null {
  const start = value.indexOf(MANIFEST_PREFIX);
  if (start < 0) return null;
  const markerStart = start + MANIFEST_PREFIX.length;
  let markerEnd = value.length;
  for (let index = markerStart; index < value.length; index += 1) {
    const char = value[index];
    if (char === ';' || char === ',' || /\s/.test(char)) {
      markerEnd = index;
      break;
    }
  }
  const encoded = value.slice(markerStart, markerEnd).trim();
  return encoded || null;
}

export function decodeManifest(value?: string): RemediationManifest | null {
  if (!value || !value.includes(MANIFEST_PREFIX)) return null;
  const encoded = extractEncodedManifest(value);
  if (!encoded) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(encoded));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (parsed.language !== undefined && typeof parsed.language !== 'string') return null;
    if (parsed.pdfUaPart !== undefined && typeof parsed.pdfUaPart !== 'string') return null;
    if (parsed.version !== undefined && typeof parsed.version !== 'number') return null;
    if (parsed.remediationMode !== undefined && parsed.remediationMode !== 'analysis-only' && parsed.remediationMode !== 'content-bound') {
      return null;
    }

    const hasSignal =
      typeof parsed.language === 'string' ||
      typeof parsed.pdfUaPart === 'string' ||
      typeof parsed.version === 'number' ||
      parsed.remediationMode === 'analysis-only' ||
      parsed.remediationMode === 'content-bound';
    if (!hasSignal) return null;

    const manifest: RemediationManifest = {
      ...(typeof parsed.version === 'number' ? { version: parsed.version } : {}),
      ...(typeof parsed.language === 'string' ? { language: parsed.language } : {}),
      ...(typeof parsed.pdfUaPart === 'string' ? { pdfUaPart: parsed.pdfUaPart } : {}),
      ...(parsed.remediationMode === 'analysis-only' || parsed.remediationMode === 'content-bound'
        ? { remediationMode: parsed.remediationMode }
        : {})
    };

    return manifest;
  } catch {
    return null;
  }
}
