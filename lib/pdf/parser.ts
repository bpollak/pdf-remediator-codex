import { getDocument } from 'pdfjs-dist';
import { ensurePdfJsWorkerConfigured } from './configure-worker';
import type { ParsedPDF } from './types';
import { decodeManifest } from '@/lib/remediate/manifest';

const MAX_STRUCT_TREE_NODES = 20000;
const MAX_OUTLINE_NODES = 20000;

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

function isRefProxy(value: unknown): value is { num: number; gen: number } {
  if (!value || typeof value !== 'object') return false;
  const maybeRef = value as { num?: unknown; gen?: unknown };
  return typeof maybeRef.num === 'number' && typeof maybeRef.gen === 'number';
}

async function resolveDestinationPage(doc: any, destination: unknown): Promise<number | undefined> {
  if (!destination) return undefined;

  let explicitDestination = destination;
  if (typeof destination === 'string') {
    explicitDestination = await doc.getDestination(destination).catch(() => null);
  }

  if (!Array.isArray(explicitDestination) || explicitDestination.length === 0) return undefined;
  const first = explicitDestination[0];

  if (isRefProxy(first)) {
    const pageIndex = await doc.getPageIndex(first).catch(() => -1);
    return pageIndex >= 0 ? pageIndex + 1 : undefined;
  }

  if (typeof first === 'number') {
    return first + 1;
  }

  return undefined;
}

function collectStructTreeTags(root: any, page: number, tags: ParsedPDF['tags']) {
  if (!root || typeof root !== 'object') return;

  const stack: unknown[] = [root];
  const visited = new WeakSet<object>();
  let processed = 0;

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (visited.has(node)) continue;
    visited.add(node);

    processed += 1;
    if (processed > MAX_STRUCT_TREE_NODES) break;

    const role = cleanText((node as { role?: unknown }).role);
    if (role) {
      tags.push({
        type: role === 'Root' ? 'Document' : role,
        page
      });
    }

    const children = (node as { children?: unknown }).children;
    if (!Array.isArray(children)) continue;
    for (let i = children.length - 1; i >= 0; i -= 1) {
      stack.push(children[i]);
    }
  }
}

function dedupeTags(tags: ParsedPDF['tags']): ParsedPDF['tags'] {
  const seen = new Set<string>();
  const deduped: ParsedPDF['tags'] = [];

  for (const tag of tags) {
    if (!tag?.type) continue;
    const key = `${tag.type}|${tag.page ?? ''}|${tag.text ?? ''}|${tag.alt ?? ''}|${tag.scope ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(tag);
  }

  return deduped;
}

function dedupeLinks(links: ParsedPDF['links']): ParsedPDF['links'] {
  const seen = new Set<string>();
  const deduped: ParsedPDF['links'] = [];
  for (const link of links) {
    const text = cleanText(link.text) ?? 'Link';
    const url = cleanText(link.url) ?? '';
    const key = `${link.page}|${text}|${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...link, text, url });
  }
  return deduped;
}

function dedupeForms(forms: ParsedPDF['forms']): ParsedPDF['forms'] {
  const seen = new Set<string>();
  const deduped: ParsedPDF['forms'] = [];
  for (const form of forms) {
    const name = cleanText(form.name) ?? '';
    if (!name) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    deduped.push({
      name,
      label: cleanText(form.label),
      required: Boolean(form.required)
    });
  }
  return deduped;
}

function dedupeOutlines(outlines: ParsedPDF['outlines']): ParsedPDF['outlines'] {
  const seen = new Set<string>();
  const deduped: ParsedPDF['outlines'] = [];
  for (const outline of outlines) {
    const title = cleanText(outline.title);
    if (!title) continue;
    const key = `${outline.page}|${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ title, page: outline.page });
  }
  return deduped;
}

async function flattenOutlines(nodes: any[] | null | undefined, doc: any, outlines: ParsedPDF['outlines']) {
  if (!nodes?.length) return;

  const stack: unknown[] = [...nodes].reverse();
  const visited = new WeakSet<object>();
  let processed = 0;

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (visited.has(node)) continue;
    visited.add(node);

    processed += 1;
    if (processed > MAX_OUTLINE_NODES) break;

    const title = cleanText((node as { title?: unknown }).title);
    const page = await resolveDestinationPage(doc, (node as { dest?: unknown }).dest);
    if (title && page) {
      outlines.push({ title, page });
    }

    const children = (node as { items?: unknown }).items;
    if (!Array.isArray(children)) continue;
    for (let i = children.length - 1; i >= 0; i -= 1) {
      stack.push(children[i]);
    }
  }
}

export async function parsePdfBytes(bytes: ArrayBuffer): Promise<ParsedPDF> {
  ensurePdfJsWorkerConfigured();
  const loadingTask = getDocument({ data: bytes });
  const doc = await loadingTask.promise;
  const metadataResult = await doc.getMetadata().catch(() => ({ info: {} as Record<string, unknown>, metadata: null }));
  const rawInfo = metadataResult.info;
  const metadata: Record<string, string | undefined> =
    rawInfo && typeof rawInfo === 'object'
      ? Object.fromEntries(
          Object.entries(rawInfo as Record<string, unknown>).map(([key, value]) => [
            key,
            typeof value === 'string' ? value : value == null ? undefined : String(value)
          ])
        )
      : {};

  const manifest = decodeManifest(metadata.Keywords) ?? decodeManifest(metadata.Subject);

  const textItems: ParsedPDF['textItems'] = [];
  const discoveredTags: ParsedPDF['tags'] = [];
  const discoveredLinks: ParsedPDF['links'] = [];
  const discoveredForms: ParsedPDF['forms'] = [];
  let discoveredHasStructTree = false;

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const [content, annotations, structTree] = await Promise.all([
      page.getTextContent(),
      page.getAnnotations({ intent: 'display' }).catch(() => []),
      page.getStructTree().catch(() => null)
    ]);

    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;

      const transform = item.transform;
      const fontName = item.fontName ?? 'Helvetica';
      const normalizedFontName = String(fontName);
      const fontSize = Math.max(8, Math.abs(transform[0]) || Math.abs(transform[3]) || 12);

      textItems.push({
        text: item.str,
        x: transform[4],
        y: transform[5],
        width: Math.max(1, item.width || 1),
        height: Math.max(1, item.height || fontSize),
        fontName: normalizedFontName,
        fontSize,
        bold: /bold|black|demi|semi/i.test(normalizedFontName),
        italic: /italic|oblique/i.test(normalizedFontName),
        page: pageNumber
      });
    }

    if (structTree) {
      discoveredHasStructTree = true;
      collectStructTreeTags(structTree, pageNumber, discoveredTags);
    }

    for (let annotationIndex = 0; annotationIndex < (annotations as any[]).length; annotationIndex += 1) {
      const annotation = (annotations as any[])[annotationIndex];
      const subtype = cleanText(annotation?.subtype);
      if (subtype === 'Link') {
        const destPage = await resolveDestinationPage(doc, annotation?.dest);
        const url = cleanText(annotation?.url) ?? cleanText(annotation?.unsafeUrl) ?? (destPage ? `#page-${destPage}` : '');
        if (!url) continue;

        discoveredLinks.push({
          text: cleanText(annotation?.contents) ?? cleanText(annotation?.titleObj) ?? url,
          url,
          page: pageNumber
        });
      }

      if (subtype === 'Widget') {
        const fieldFlags = typeof annotation?.fieldFlags === 'number' ? annotation.fieldFlags : 0;
        discoveredForms.push({
          name: cleanText(annotation?.fieldName) ?? cleanText(annotation?.id) ?? `field-${pageNumber}-${annotationIndex + 1}`,
          label: cleanText(annotation?.alternativeText),
          required: Boolean(fieldFlags & 0x2)
        });
      }
    }
  }

  const discoveredOutlines: ParsedPDF['outlines'] = [];
  const outlineTree = await doc.getOutline().catch(() => null);
  await flattenOutlines(outlineTree, doc, discoveredOutlines);

  if (manifest?.pdfUaPart && !metadata['pdfuaid:part']) {
    metadata['pdfuaid:part'] = manifest.pdfUaPart;
  }

  const metadataLang =
    cleanText(metadata.Language) ??
    cleanText(metadata.Lang) ??
    (typeof (metadataResult as any)?.metadata?.get === 'function'
      ? cleanText((metadataResult as any).metadata.get('dc:language'))
      : undefined);

  return {
    pageCount: doc.numPages,
    metadata,
    language: manifest?.language ?? metadataLang,
    title: cleanText(metadata.Title),
    hasStructTree: Boolean(manifest?.hasStructTree || discoveredHasStructTree),
    tags: dedupeTags([...(manifest?.tags ?? []), ...discoveredTags]),
    textItems,
    images: manifest?.images ?? [],
    links: dedupeLinks([...(manifest?.links ?? []), ...discoveredLinks]),
    outlines: dedupeOutlines([...(manifest?.outlines ?? []), ...discoveredOutlines]),
    forms: dedupeForms([...(manifest?.forms ?? []), ...discoveredForms])
  };
}
