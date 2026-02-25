import { OPS, getDocument } from 'pdfjs-dist';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber } from 'pdf-lib';
import { ensurePdfJsWorkerConfigured } from './configure-worker';
import type { ParsedPDF } from './types';
import { decodeManifest } from '@/lib/remediate/manifest';

const MAX_STRUCT_TREE_NODES = 20000;
const MAX_OUTLINE_NODES = 20000;
const MAX_STRUCT_BINDING_NODES = 50000;
const MAX_IMAGE_ITEMS = 5000;

const OPS_RECORD = OPS as Record<string, number | undefined>;
const OP_SAVE = OPS_RECORD.save;
const OP_RESTORE = OPS_RECORD.restore;
const OP_TRANSFORM = OPS_RECORD.transform;
const IMAGE_OPERATOR_CODES = new Set(
  [
    OPS_RECORD.paintImageXObject,
    OPS_RECORD.paintInlineImageXObject,
    OPS_RECORD.paintImageMaskXObject,
    OPS_RECORD.paintJpegXObject
  ].filter((code): code is number => typeof code === 'number')
);

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

type Matrix = [number, number, number, number, number, number];

const IDENTITY_MATRIX: Matrix = [1, 0, 0, 1, 0, 0];

function asFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function matrixFromArgs(args: unknown): Matrix | undefined {
  if (!Array.isArray(args) || args.length < 6) return undefined;
  const a = asFiniteNumber(args[0], Number.NaN);
  const b = asFiniteNumber(args[1], Number.NaN);
  const c = asFiniteNumber(args[2], Number.NaN);
  const d = asFiniteNumber(args[3], Number.NaN);
  const e = asFiniteNumber(args[4], Number.NaN);
  const f = asFiniteNumber(args[5], Number.NaN);
  if ([a, b, c, d, e, f].some((value) => Number.isNaN(value))) return undefined;
  return [a, b, c, d, e, f];
}

function multiplyMatrix(left: Matrix, right: Matrix): Matrix {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5]
  ];
}

function transformPoint(matrix: Matrix, x: number, y: number): { x: number; y: number } {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5]
  };
}

function matrixBounds(matrix: Matrix): { x: number; y: number; width: number; height: number } {
  const points = [
    transformPoint(matrix, 0, 0),
    transformPoint(matrix, 1, 0),
    transformPoint(matrix, 0, 1),
    transformPoint(matrix, 1, 1)
  ];

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY)
  };
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

function dedupeImages(images: ParsedPDF['images']): ParsedPDF['images'] {
  const seen = new Set<string>();
  const deduped: ParsedPDF['images'] = [];
  for (const image of images) {
    const key = [
      image.page,
      Math.round(image.x),
      Math.round(image.y),
      Math.round(image.width),
      Math.round(image.height)
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(image);
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

async function extractPageImages(page: any, pageNumber: number): Promise<ParsedPDF['images']> {
  const operatorList = await page.getOperatorList().catch(() => null);
  if (!operatorList || !Array.isArray(operatorList.fnArray) || !Array.isArray(operatorList.argsArray)) {
    return [];
  }

  const images: ParsedPDF['images'] = [];
  const matrixStack: Matrix[] = [];
  let ctm = IDENTITY_MATRIX;

  for (let index = 0; index < operatorList.fnArray.length; index += 1) {
    if (images.length >= MAX_IMAGE_ITEMS) break;

    const fn = operatorList.fnArray[index];
    const args = operatorList.argsArray[index];

    if (fn === OP_SAVE) {
      matrixStack.push(ctm);
      continue;
    }

    if (fn === OP_RESTORE) {
      ctm = matrixStack.pop() ?? IDENTITY_MATRIX;
      continue;
    }

    if (fn === OP_TRANSFORM) {
      const transform = matrixFromArgs(args);
      if (transform) ctm = multiplyMatrix(ctm, transform);
      continue;
    }

    if (!IMAGE_OPERATOR_CODES.has(fn)) continue;

    const bounds = matrixBounds(ctm);
    if (bounds.width < 1 || bounds.height < 1) continue;

    images.push({
      id: `img-${pageNumber}-${images.length + 1}`,
      page: pageNumber,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    });
  }

  return images;
}

function asPdfDict(value: unknown): PDFDict | undefined {
  return isPdfDictLike(value) ? (value as PDFDict) : undefined;
}

function isPdfDictLike(value: unknown): value is PDFDict {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { get?: unknown }).get === 'function' &&
      typeof (value as { has?: unknown }).has === 'function'
  );
}

function isPdfArrayLike(value: unknown): value is PDFArray {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { size?: unknown }).size === 'function' &&
      typeof (value as { get?: unknown }).get === 'function'
  );
}

function isPdfNumberLike(value: unknown): value is PDFNumber {
  return Boolean(value && typeof value === 'object' && typeof (value as { asNumber?: unknown }).asNumber === 'function');
}

function safeLookup(context: PDFDocument['context'], value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  try {
    return context.lookup(value as any);
  } catch {
    return undefined;
  }
}

function isContentReference(dict: PDFDict): boolean {
  const typeName = dict.get(PDFName.of('Type'))?.toString();
  return typeName === '/MCR' || typeName === '/OBJR' || dict.has(PDFName.of('MCID'));
}

function countContentReferences(context: PDFDocument['context'], value: unknown): { numericK: number; mcr: number } {
  const resolved = safeLookup(context, value) ?? value;
  if (!resolved) return { numericK: 0, mcr: 0 };
  if (isPdfNumberLike(resolved)) return { numericK: 1, mcr: 0 };
  if (isPdfArrayLike(resolved)) {
    let numericK = 0;
    let mcr = 0;
    for (let index = 0; index < resolved.size(); index += 1) {
      const nested = countContentReferences(context, resolved.get(index));
      numericK += nested.numericK;
      mcr += nested.mcr;
    }
    return { numericK, mcr };
  }

  const dict = asPdfDict(resolved);
  if (!dict) return { numericK: 0, mcr: 0 };
  return isContentReference(dict) ? { numericK: 0, mcr: 1 } : { numericK: 0, mcr: 0 };
}

function hasParentTreeContentEntries(context: PDFDocument['context'], parentTreeObject: unknown): boolean {
  const parentTreeDict = asPdfDict(safeLookup(context, parentTreeObject));
  if (!parentTreeDict) return false;

  const stack: PDFDict[] = [parentTreeDict];
  const visited = new WeakSet<object>();
  let processed = 0;

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (visited.has(node)) continue;
    visited.add(node);

    processed += 1;
    if (processed > MAX_STRUCT_BINDING_NODES) break;

    const nums = safeLookup(context, node.get(PDFName.of('Nums')));
    if (isPdfArrayLike(nums) && nums.size() > 0) return true;

    const kids = safeLookup(context, node.get(PDFName.of('Kids')));
    if (!isPdfArrayLike(kids) || kids.size() === 0) continue;

    for (let index = 0; index < kids.size(); index += 1) {
      const kid = asPdfDict(safeLookup(context, kids.get(index)));
      if (kid) stack.push(kid);
    }
  }

  return false;
}

async function inspectStructureBinding(bytes: ArrayBuffer): Promise<ParsedPDF['structureBinding'] | undefined> {
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const context = pdf.context;
    const structTreeRootObject = pdf.catalog.get(PDFName.of('StructTreeRoot'));
    const structTreeRootDict = asPdfDict(safeLookup(context, structTreeRootObject));
    const parentTreeObject = structTreeRootDict?.get(PDFName.of('ParentTree'));
    const hasParentTree = parentTreeObject !== undefined;
    const hasParentTreeEntries = hasParentTree && hasParentTreeContentEntries(context, parentTreeObject);

    let structElemCount = 0;
    let structElemWithPageRef = 0;
    let structElemWithMcid = 0;
    let structElemWithNumericK = 0;
    let structElemWithMcr = 0;
    let tableStructCount = 0;
    let rowStructCount = 0;
    let headerCellStructCount = 0;
    let dataCellStructCount = 0;

    const queue: unknown[] = [];
    if (structTreeRootDict) {
      const rootKids = structTreeRootDict.get(PDFName.of('K'));
      if (rootKids !== undefined) queue.push(rootKids);
    }

    const visited = new WeakSet<object>();
    let processed = 0;

    while (queue.length > 0) {
      const rawNode = queue.pop();
      if (rawNode === undefined) continue;
      const node = safeLookup(context, rawNode) ?? rawNode;
      if (!node) continue;

      if (isPdfArrayLike(node)) {
        for (let index = node.size() - 1; index >= 0; index -= 1) {
          queue.push(node.get(index));
        }
        continue;
      }

      const dict = asPdfDict(node);
      if (!dict) continue;
      if (visited.has(dict)) continue;
      visited.add(dict);

      processed += 1;
      if (processed > MAX_STRUCT_BINDING_NODES) break;

      const looksStructElem =
        dict.has(PDFName.of('S')) ||
        dict.has(PDFName.of('P')) ||
        dict.has(PDFName.of('Pg')) ||
        dict.has(PDFName.of('K'));

      if (!looksStructElem) continue;

      structElemCount += 1;
      if (dict.has(PDFName.of('Pg'))) structElemWithPageRef += 1;
      if (dict.has(PDFName.of('MCID'))) structElemWithMcid += 1;

      const roleName = dict.get(PDFName.of('S'))?.toString();
      if (roleName === '/Table') tableStructCount += 1;
      if (roleName === '/TR') rowStructCount += 1;
      if (roleName === '/TH') headerCellStructCount += 1;
      if (roleName === '/TD') dataCellStructCount += 1;

      const kids = dict.get(PDFName.of('K'));
      if (kids === undefined) continue;

      const contentRefs = countContentReferences(context, kids);
      structElemWithNumericK += contentRefs.numericK;
      structElemWithMcr += contentRefs.mcr;
      queue.push(kids);
    }

    if (structElemCount === 0) {
      for (const [, candidate] of context.enumerateIndirectObjects()) {
        const dict = asPdfDict(candidate);
        if (!dict) continue;

        const typeName = dict.get(PDFName.of('Type'))?.toString();
        const roleName = dict.get(PDFName.of('S'))?.toString();
        const hasStructSignals =
          typeName === '/StructElem' ||
          dict.has(PDFName.of('K')) ||
          dict.has(PDFName.of('P')) ||
          dict.has(PDFName.of('Pg'));
        if (!roleName || !hasStructSignals) continue;

        structElemCount += 1;
        if (dict.has(PDFName.of('Pg'))) structElemWithPageRef += 1;
        if (dict.has(PDFName.of('MCID'))) structElemWithMcid += 1;

        if (roleName === '/Table') tableStructCount += 1;
        if (roleName === '/TR') rowStructCount += 1;
        if (roleName === '/TH') headerCellStructCount += 1;
        if (roleName === '/TD') dataCellStructCount += 1;

        const kids = dict.get(PDFName.of('K'));
        if (kids === undefined) continue;
        const contentRefs = countContentReferences(context, kids);
        structElemWithNumericK += contentRefs.numericK;
        structElemWithMcr += contentRefs.mcr;
      }
    }

    return {
      structElemCount,
      structElemWithPageRef,
      structElemWithMcid,
      structElemWithNumericK,
      structElemWithMcr,
      hasParentTree,
      hasParentTreeEntries,
      tableStructCount,
      rowStructCount,
      headerCellStructCount,
      dataCellStructCount,
      hasContentBinding: Boolean(
        structElemWithMcid > 0 ||
        structElemWithNumericK > 0 ||
        structElemWithMcr > 0 ||
        hasParentTreeEntries
      )
    };
  } catch {
    return undefined;
  }
}

export async function parsePdfBytes(bytes: ArrayBuffer): Promise<ParsedPDF> {
  const structureBindingPromise = inspectStructureBinding(bytes.slice(0));
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
  const structureBinding = await structureBindingPromise;

  const textItems: ParsedPDF['textItems'] = [];
  const discoveredTags: ParsedPDF['tags'] = [];
  const discoveredLinks: ParsedPDF['links'] = [];
  const discoveredForms: ParsedPDF['forms'] = [];
  const discoveredImages: ParsedPDF['images'] = [];
  let discoveredHasStructTree = false;

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const [content, annotations, structTree, imageItems] = await Promise.all([
      page.getTextContent(),
      page.getAnnotations({ intent: 'display' }).catch(() => []),
      page.getStructTree().catch(() => null),
      extractPageImages(page, pageNumber)
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

    if (imageItems.length > 0) {
      discoveredImages.push(...imageItems);
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
    remediationMode: manifest?.remediationMode,
    hasStructTree: Boolean(discoveredHasStructTree || structureBinding?.structElemCount || structureBinding?.hasParentTree),
    structureBinding,
    tags: dedupeTags(discoveredTags),
    textItems,
    images: dedupeImages(discoveredImages),
    links: dedupeLinks(discoveredLinks),
    outlines: dedupeOutlines(discoveredOutlines),
    forms: dedupeForms(discoveredForms)
  };
}
