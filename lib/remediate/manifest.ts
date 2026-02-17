import type { ParsedPDF } from '@/lib/pdf/types';

export const MANIFEST_PREFIX = 'AccessiblePDFManifest=';

export interface RemediationManifest {
  hasStructTree: boolean;
  language?: string;
  tags: ParsedPDF['tags'];
  outlines: ParsedPDF['outlines'];
  forms: ParsedPDF['forms'];
  images: ParsedPDF['images'];
  links: ParsedPDF['links'];
  pdfUaPart?: string;
}

export function encodeManifest(manifest: RemediationManifest): string {
  return `${MANIFEST_PREFIX}${encodeURIComponent(JSON.stringify(manifest))}`;
}

export function decodeManifest(value?: string): RemediationManifest | null {
  if (!value || !value.includes(MANIFEST_PREFIX)) return null;

  const marker = value.slice(value.indexOf(MANIFEST_PREFIX) + MANIFEST_PREFIX.length);
  const encoded = marker.split(/[;,]/, 1)[0] ?? '';
  if (!encoded) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(encoded));
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.hasStructTree !== 'boolean') return null;
    if (!Array.isArray(parsed.tags)) return null;
    return parsed as RemediationManifest;
  } catch {
    return null;
  }
}
