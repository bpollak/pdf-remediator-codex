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

function isArrayOrUndefined(value: unknown): boolean {
  return value === undefined || Array.isArray(value);
}

export function decodeManifest(value?: string): RemediationManifest | null {
  if (!value || !value.includes(MANIFEST_PREFIX)) return null;

  const marker = value.slice(value.indexOf(MANIFEST_PREFIX) + MANIFEST_PREFIX.length);
  const encoded = marker.split(/[;,]/, 1)[0] ?? '';
  if (!encoded) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(encoded));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (typeof parsed.hasStructTree !== 'boolean') return null;
    if (!Array.isArray(parsed.tags)) return null;
    if (!isArrayOrUndefined(parsed.outlines)) return null;
    if (!isArrayOrUndefined(parsed.forms)) return null;
    if (!isArrayOrUndefined(parsed.images)) return null;
    if (!isArrayOrUndefined(parsed.links)) return null;
    if (parsed.language !== undefined && typeof parsed.language !== 'string') return null;
    if (parsed.pdfUaPart !== undefined && typeof parsed.pdfUaPart !== 'string') return null;

    const manifest: RemediationManifest = {
      hasStructTree: parsed.hasStructTree,
      tags: parsed.tags,
      outlines: Array.isArray(parsed.outlines) ? parsed.outlines : [],
      forms: Array.isArray(parsed.forms) ? parsed.forms : [],
      images: Array.isArray(parsed.images) ? parsed.images : [],
      links: Array.isArray(parsed.links) ? parsed.links : [],
      ...(typeof parsed.language === 'string' ? { language: parsed.language } : {}),
      ...(typeof parsed.pdfUaPart === 'string' ? { pdfUaPart: parsed.pdfUaPart } : {})
    };

    return manifest;
  } catch {
    return null;
  }
}
