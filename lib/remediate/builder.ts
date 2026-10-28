import {
  PDFArray,
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames,
  PDFRawStream,
  StandardFonts,
  TextRenderingMode,
  beginText,
  decodePDFRawStream,
  endMarkedContent,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  rgb
} from 'pdf-lib';
import type { ParsedPDF, RemediationMode } from '@/lib/pdf/types';
import { extractRemediationPlan } from './extractor';
import { createHeadingLevelNormalizer } from './heuristics';
import { encodePdfTextString } from './pdf-text';
import { decodePageContent, maxMcidInContent } from './page-content';
import { buildXmpMetadata } from './xmp';
import { assertNotEncrypted, assertNotSigned } from '@/lib/pdf/encryption';
import { mapFontName } from './font-mapper';
import { buildTagTree } from './tagger';
import { injectStructTree } from './struct-tree';
import { encodeManifest, MANIFEST_PREFIX } from './manifest';
import type { VerapdfResult } from '@/lib/verapdf/types';
import { getVerapdfComplianceVerdict } from '@/lib/verapdf/result';

const MAX_OCR_TEXT_LAYER_ITEMS = 20000;
const MAX_TAGGED_TEXT_ITEMS = 1200;

interface TaggedTextLayerItem {
  role: string;
  page: number;
  text: string;
  x: number;
  y: number;
  fontSize: number;
}

interface TaggedBinding {
  role: string;
  page: number;
  mcid: number;
}

interface PdfPageWithFontDictionary {
  node: {
    newFontDictionary: (prefix: string, ref: unknown) => PDFName;
  };
}

function sanitizeTextForFont(font: Awaited<ReturnType<PDFDocument['embedFont']>>, text: string): string {
  let sanitized = '';

  for (const char of text) {
    try {
      font.encodeText(char);
      sanitized += char;
    } catch {
      sanitized += char === '\n' || char === '\t' ? char : '*';
    }
  }

  return sanitized;
}

function splitKeywords(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[;,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function safeReadPdfMetadata(getter: () => string | undefined): string | undefined {
  try {
    const value = getter();
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    return normalized || undefined;
  } catch {
    return undefined;
  }
}

function safeReadPdfDate(getter: () => Date | undefined): Date | undefined {
  try {
    const value = getter();
    return value instanceof Date && !Number.isNaN(value.getTime()) ? value : undefined;
  } catch {
    return undefined;
  }
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function cleanLabelText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value
    .replace(/\s+/g, ' ')
    .replace(/\s*[:：]\s*$/, '')
    .trim();
  if (normalized.length < 2 || normalized.length > 120) return undefined;
  return normalized;
}

/** Largest gap (pt) between a label's right edge and the field it labels. */
const MAX_LEFT_LABEL_GAP = 100;
/** Largest gap (pt) between a label's baseline and the top of the field below it. */
const MAX_ABOVE_LABEL_GAP = 24;

/**
 * Text that clearly labels a field: on the same line immediately to its left
 * (vertically overlapping the field), or directly above it. Anything looser
 * is left for a person to label; a wrong tooltip is worse than none.
 */
function inferNearbyFormLabel(parsed: ParsedPDF, form: ParsedPDF['forms'][number]): string | undefined {
  if (
    typeof form.page !== 'number' ||
    typeof form.x !== 'number' ||
    typeof form.y !== 'number' ||
    typeof form.width !== 'number' ||
    typeof form.height !== 'number'
  ) {
    return undefined;
  }

  const formLeft = form.x;
  const formRight = form.x + form.width;
  const formBottom = form.y;
  const formTop = form.y + form.height;
  const formHeight = form.height;

  const candidates = parsed.textItems
    .filter((item) => item.page === form.page)
    .map((item) => {
      const text = cleanLabelText(item.text);
      if (!text) return undefined;

      const itemLeft = item.x;
      const itemRight = item.x + item.width;
      // y is the baseline; allow a little descender below it.
      const itemBottom = item.y - item.height * 0.2;
      const itemTop = item.y + item.height;

      const verticalOverlap = Math.min(itemTop, formTop) - Math.max(itemBottom, formBottom);
      const leftGap = formLeft - itemRight;
      const leftOfField =
        verticalOverlap >= 0.5 * Math.min(item.height, formHeight) && leftGap >= -2 && leftGap <= MAX_LEFT_LABEL_GAP;

      const aboveGap = itemBottom - formTop;
      const horizontalOverlap = Math.min(itemRight, formRight) - Math.max(itemLeft, formLeft);
      const aboveField =
        aboveGap >= -2 && aboveGap <= MAX_ABOVE_LABEL_GAP && horizontalOverlap > 0 && itemLeft >= formLeft - 12;

      if (!leftOfField && !aboveField) return undefined;
      return { text, distance: leftOfField ? Math.max(0, leftGap) : Math.max(0, aboveGap) };
    })
    .filter((item): item is { text: string; distance: number } => Boolean(item))
    .sort((a, b) => a.distance - b.distance);

  return candidates[0]?.text;
}

function inferFormLabels(parsed: ParsedPDF): Map<string, string> {
  const labels = new Map<string, string>();

  for (const form of parsed.forms) {
    if (cleanLabelText(form.label)) continue;
    // Field names ("Text1", "Check Box2") are never used as labels.
    const label = inferNearbyFormLabel(parsed, form);
    if (!label) continue;
    labels.set(form.name.replace(/\s+/g, ' ').trim(), label);
  }

  return labels;
}

function parseColor(color?: string) {
  if (!color || !/^#?[0-9a-f]{6}$/i.test(color)) return rgb(0, 0, 0);
  const normalized = color.startsWith('#') ? color.slice(1) : color;
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

function resolveTaggedLayerItems(
  parsed: ParsedPDF,
  plan: ReturnType<typeof extractRemediationPlan>,
  ocrOnly: boolean
): TaggedTextLayerItem[] {
  const items: TaggedTextLayerItem[] = [];
  const seen = new Set<string>();
  const fallbackCursor = new Map<number, number>();

  function pushItem(role: string, page: number, rawText: string, x?: number, y?: number, fontSize?: number) {
    // Full text, never truncated. Only an exact repeat at the same position
    // is dropped: different lines that share wording ("Status: pending")
    // are all kept.
    const text = normalizeText(rawText);
    if (!text) return;
    if (page < 1 || page > parsed.pageCount) return;

    const dedupeKey = `${role}|${page}|${Math.round(x ?? -1)}|${Math.round(y ?? -1)}|${text}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    const fallbackY = fallbackCursor.get(page) ?? 760;
    fallbackCursor.set(page, fallbackY - 12);

    items.push({
      role,
      page,
      text,
      x: typeof x === 'number' ? x : 36,
      y: typeof y === 'number' ? y : fallbackY,
      fontSize: typeof fontSize === 'number' ? fontSize : 11
    });
  }

  if (ocrOnly) {
    for (const item of parsed.textItems.filter((textItem) => textItem.fontName === 'OCR').slice(0, MAX_OCR_TEXT_LAYER_ITEMS)) {
      pushItem('P', item.page, item.text, item.x, item.y, item.fontSize);
    }
    return items;
  }

  // One pass in reading order (page, then the extractor's column-aware
  // order) so headings and body text interleave the way they are read.
  // Heading lines are excluded from paragraphs upstream, so each line is
  // tagged once. List items are tagged as P (no L/LI nesting here).
  for (const entry of plan.readingOrder) {
    const role = /^H[1-6]$/.test(entry.role) ? entry.role : 'P';
    pushItem(role, entry.page, entry.text, entry.x, entry.y, entry.fontSize);
    if (items.length >= MAX_TAGGED_TEXT_ITEMS) return items;
  }

  return items;
}

function beginMarkedContentSequence(
  tag: string,
  mcid: number,
  context: PDFDocument['context'],
  actualText?: string
): PDFOperator {
  const props = context.obj({ MCID: PDFNumber.of(mcid) }) as PDFDict;
  if (actualText) props.set(PDFName.of('ActualText'), encodePdfTextString(actualText));
  // pdf-lib's PDFOperator.of types the second element as PDFName, but the
  // PDF spec expects a dictionary here.  The cast is required because
  // pdf-lib doesn't model BDC operator arguments precisely.
  return PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [
    PDFName.of(tag),
    props as unknown as PDFName
  ]);
}

async function embedTaggedInvisibleTextLayer(
  pdf: PDFDocument,
  items: TaggedTextLayerItem[]
): Promise<TaggedBinding[]> {
  if (!items.length) return [];

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const fontKeyByPage = new Map<number, PDFName>();
  const nextMcidByPage = new Map<number, number>();
  const bindings: TaggedBinding[] = [];

  function fontResourceForPage(pageNumber: number, page: (typeof pages)[number]): PDFName {
    const existing = fontKeyByPage.get(pageNumber);
    if (existing) return existing;
    const key = (page as unknown as PdfPageWithFontDictionary).node.newFontDictionary('F', font.ref);
    fontKeyByPage.set(pageNumber, key);
    return key;
  }

  // Existing marked content keeps its MCIDs; new sequences start above
  // them. Read before any page is touched (adding resources normalizes the
  // page and wraps its content).
  for (const pageNumber of new Set(items.map((item) => item.page))) {
    const page = pages[pageNumber - 1];
    if (!page) continue;
    const content = decodePageContent(pdf, page);
    nextMcidByPage.set(pageNumber, content === undefined ? 0 : maxMcidInContent(content) + 1);
  }

  for (const item of items) {
    const page = pages[item.page - 1];
    if (!page) continue;

    const safeText = sanitizeTextForFont(font, item.text).trim();
    if (!safeText) continue;
    // Helvetica only covers WinAnsi. When characters had to be replaced,
    // the real text goes in /ActualText so assistive technology reads it.
    const actualText = safeText === item.text.trim() ? undefined : item.text.trim();

    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const x = clamp(item.x, 0, Math.max(0, pageWidth - 1));
    const y = clamp(item.y, 0, Math.max(0, pageHeight - 1));
    const size = Math.max(6, Math.min(item.fontSize, 72));
    const fontKey = fontResourceForPage(item.page, page);
    const mcid = nextMcidByPage.get(item.page) ?? 0;
    nextMcidByPage.set(item.page, mcid + 1);
    // Run the text along the displayed page: on a page with /Rotate the
    // user-space text direction is rotated by the same angle.
    const rotation = ((((page.getRotation().angle ?? 0) % 360) + 360) % 360) * (Math.PI / 180);
    const cos = Math.round(Math.cos(rotation));
    const sin = Math.round(Math.sin(rotation));

    page.pushOperators(
      pushGraphicsState(),
      beginMarkedContentSequence('Span', mcid, pdf.context, actualText),
      beginText(),
      setTextRenderingMode(TextRenderingMode.Invisible),
      setFontAndSize(fontKey, size),
      setTextMatrix(cos, sin, -sin, cos, x, y),
      showText(font.encodeText(safeText)),
      endText(),
      endMarkedContent(),
      popGraphicsState()
    );

    bindings.push({
      role: item.role,
      page: item.page,
      mcid
    });
  }

  return bindings;
}

function injectBoundStructTreeFromBindings(pdf: PDFDocument, bindings: TaggedBinding[]): boolean {
  if (bindings.length === 0) return false;

  const context = pdf.context;
  const pages = pdf.getPages();

  // Keep any existing MarkInfo entries (Suspects, UserProperties); only
  // Marked is set, because the document now has a bound structure tree.
  const markInfoDict = lookupMaybeDict(pdf, pdf.catalog.get(PDFName.of('MarkInfo'))) ?? context.obj({});
  markInfoDict.set(PDFName.of('Marked'), PDFBool.True);
  if (!pdf.catalog.get(PDFName.of('MarkInfo'))) {
    pdf.catalog.set(PDFName.of('MarkInfo'), context.register(markInfoDict));
  }

  const structTreeRootDict = context.obj({ Type: 'StructTreeRoot' });
  const structTreeRootRef = context.register(structTreeRootDict);

  // Only standard structure types are used, so no RoleMap is needed (an
  // identity RoleMap would remap standard types onto themselves).

  const documentElemDict = context.obj({
    Type: 'StructElem',
    S: 'Document'
  });
  documentElemDict.set(PDFName.of('P'), structTreeRootRef);
  const documentElemRef = context.register(documentElemDict);

  const children = PDFArray.withContext(context);
  const parentEntriesByPage = new Map<number, Array<{ mcid: number; ref: ReturnType<typeof context.register> }>>();

  for (const binding of bindings) {
    const pageRef = pages[binding.page - 1]?.ref;
    if (!pageRef) continue;

    const role = /^H[1-6]$/.test(binding.role) ? binding.role : 'P';
    const elemDict = context.obj({
      Type: 'StructElem',
      S: role
    });
    elemDict.set(PDFName.of('P'), documentElemRef);
    elemDict.set(PDFName.of('Pg'), pageRef);
    elemDict.set(PDFName.of('K'), PDFNumber.of(binding.mcid));

    const elemRef = context.register(elemDict);
    children.push(elemRef);

    let pageEntries = parentEntriesByPage.get(binding.page);
    if (!pageEntries) {
      pageEntries = [];
      parentEntriesByPage.set(binding.page, pageEntries);
    }
    pageEntries.push({ mcid: binding.mcid, ref: elemRef });
  }

  if (children.size() === 0) return false;
  documentElemDict.set(PDFName.of('K'), children);
  structTreeRootDict.set(PDFName.of('K'), documentElemRef);

  const nums = PDFArray.withContext(context);
  let maxStructParents = -1;

  for (const [pageNumber, entries] of [...parentEntriesByPage.entries()].sort((a, b) => a[0] - b[0])) {
    const page = pages[pageNumber - 1];
    if (!page) continue;

    const structParents = pageNumber - 1;
    maxStructParents = Math.max(maxStructParents, structParents);
    page.node.set(PDFName.of('StructParents'), PDFNumber.of(structParents));
    page.node.set(PDFName.of('Tabs'), PDFName.of('S'));

    const maxMcid = entries.reduce((max, entry) => Math.max(max, entry.mcid), -1);
    const parentArray = PDFArray.withContext(context);
    for (let index = 0; index <= maxMcid; index += 1) {
      parentArray.push(PDFNull);
    }
    for (const entry of entries) {
      parentArray.set(entry.mcid, entry.ref);
    }

    const parentArrayRef = context.register(parentArray);
    nums.push(PDFNumber.of(structParents));
    nums.push(parentArrayRef);
  }

  const parentTreeDict = context.obj({ Nums: nums });
  const parentTreeRef = context.register(parentTreeDict);
  structTreeRootDict.set(PDFName.of('ParentTree'), parentTreeRef);
  structTreeRootDict.set(PDFName.of('ParentTreeNextKey'), PDFNumber.of(maxStructParents + 1));

  pdf.catalog.set(PDFName.of('StructTreeRoot'), structTreeRootRef);
  return true;
}

function applyStructureTabOrder(pdf: PDFDocument): void {
  for (const page of pdf.getPages()) {
    page.node.set(PDFName.of('Tabs'), PDFName.of('S'));
  }
}

function normalizeBoundStructureHeadings(pdf: PDFDocument): boolean {
  const structTreeRoot = lookupMaybeDict(pdf, pdf.catalog.get(PDFName.of('StructTreeRoot')));
  if (!structTreeRoot) return false;

  const visited = new Set<PDFDict>();
  const normalizeLevel = createHeadingLevelNormalizer();
  let changed = false;

  function visit(value: unknown): void {
    const array = lookupMaybeArray(pdf, value);
    if (array) {
      for (let index = 0; index < array.size(); index += 1) {
        visit(array.get(index));
      }
      return;
    }

    const dict = lookupMaybeDict(pdf, value);
    if (!dict || visited.has(dict)) return;
    visited.add(dict);

    const role = dict.get(PDFName.of('S'));
    if (role instanceof PDFName) {
      const match = role.toString().match(/^\/H([1-6])$/);
      if (match) {
        const originalLevel = Number(match[1]);
        const nextLevel = normalizeLevel(originalLevel);
        if (nextLevel !== originalLevel) {
          dict.set(PDFName.of('S'), PDFName.of(`H${nextLevel}`));
          changed = true;
        }
      }
    }

    visit(dict.get(PDFName.of('K')));
  }

  visit(structTreeRoot.get(PDFName.of('K')));
  return changed;
}

function createDestinationArray(pdf: PDFDocument, pageNumber: number): PDFArray | undefined {
  const pageRef = pdf.getPages()[pageNumber - 1]?.ref;
  if (!pageRef) return undefined;

  const destination = PDFArray.withContext(pdf.context);
  destination.push(pageRef);
  destination.push(PDFName.of('Fit'));
  return destination;
}

function injectOutlineFromHeadings(pdf: PDFDocument, headings: Array<{ text: string; page: number }>): boolean {
  if (pdf.catalog.get(PDFName.of('Outlines'))) return false;

  const outlineEntries = headings
    .map((heading) => ({
      title: cleanLabelText(heading.text),
      page: heading.page
    }))
    .filter((heading): heading is { title: string; page: number } => Boolean(heading.title))
    .filter((heading) => heading.page >= 1 && heading.page <= pdf.getPageCount())
    .slice(0, 200);

  if (outlineEntries.length === 0) return false;

  const context = pdf.context;
  const outlinesDict = context.obj({ Type: 'Outlines' }) as PDFDict;
  const outlinesRef = context.register(outlinesDict);
  const itemRefs: ReturnType<typeof context.register>[] = [];

  for (const entry of outlineEntries) {
    const dest = createDestinationArray(pdf, entry.page);
    if (!dest) continue;

    const itemDict = context.obj({
      Title: encodePdfTextString(entry.title),
      Parent: outlinesRef,
      Dest: dest
    }) as PDFDict;
    itemRefs.push(context.register(itemDict));
  }

  if (itemRefs.length === 0) return false;

  for (let index = 0; index < itemRefs.length; index += 1) {
    const itemDict = context.lookup(itemRefs[index]!, PDFDict);
    const previousRef = itemRefs[index - 1];
    const nextRef = itemRefs[index + 1];
    if (previousRef) itemDict.set(PDFName.of('Prev'), previousRef);
    if (nextRef) itemDict.set(PDFName.of('Next'), nextRef);
  }

  outlinesDict.set(PDFName.of('First'), itemRefs[0]!);
  outlinesDict.set(PDFName.of('Last'), itemRefs[itemRefs.length - 1]!);
  outlinesDict.set(PDFName.of('Count'), PDFNumber.of(itemRefs.length));
  pdf.catalog.set(PDFName.of('Outlines'), outlinesRef);
  pdf.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));

  return true;
}

function lookupMaybeDict(pdf: PDFDocument, value: unknown): PDFDict | undefined {
  if (!value) return undefined;
  if (value instanceof PDFDict) return value;

  try {
    const lookedUp = pdf.context.lookup(value as Parameters<typeof pdf.context.lookup>[0]);
    return lookedUp instanceof PDFDict ? lookedUp : undefined;
  } catch {
    return undefined;
  }
}

function lookupMaybeArray(pdf: PDFDocument, value: unknown): PDFArray | undefined {
  if (!value) return undefined;
  if (value instanceof PDFArray) return value;

  try {
    const lookedUp = pdf.context.lookup(value as Parameters<typeof pdf.context.lookup>[0]);
    return lookedUp instanceof PDFArray ? lookedUp : undefined;
  } catch {
    return undefined;
  }
}

function readPdfText(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as { decodeText?: () => string };
  if (typeof candidate.decodeText !== 'function') return undefined;

  try {
    return cleanLabelText(candidate.decodeText());
  } catch {
    return undefined;
  }
}

function isPdfName(value: unknown, name: string): boolean {
  return value instanceof PDFName && value.toString() === `/${name}`;
}

function readRawPdfText(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as { decodeText?: () => string };
  if (typeof candidate.decodeText !== 'function') return undefined;
  try {
    return candidate.decodeText();
  } catch {
    return undefined;
  }
}

/**
 * The terminal field a widget belongs to: the widget itself when it carries
 * a partial name (/T), otherwise its /Parent (a kid widget of a field).
 */
function terminalFieldForWidget(pdf: PDFDocument, widget: PDFDict): PDFDict {
  if (widget.has(PDFName.of('T'))) return widget;
  return lookupMaybeDict(pdf, widget.get(PDFName.of('Parent'))) ?? widget;
}

/**
 * Fully qualified field name ("person.street"): the /T partial names of the
 * field and all its ancestors joined with ".", as pdf.js reports it.
 */
function readFullFieldName(pdf: PDFDocument, widget: PDFDict): string | undefined {
  const parts: string[] = [];
  const visited = new Set<PDFDict>();
  let node: PDFDict | undefined = widget;

  while (node && !visited.has(node) && visited.size < 64) {
    visited.add(node);
    const partial = readRawPdfText(node.get(PDFName.of('T')));
    if (partial) parts.unshift(partial);
    node = lookupMaybeDict(pdf, node.get(PDFName.of('Parent')));
  }

  const name = parts.join('.').replace(/\s+/g, ' ').trim();
  return name || undefined;
}

function hasWidgetTooltip(pdf: PDFDocument, widget: PDFDict): boolean {
  if (readPdfText(widget.get(PDFName.of('TU')))) return true;
  const field = terminalFieldForWidget(pdf, widget);
  return Boolean(readPdfText(field.get(PDFName.of('TU'))));
}

function setWidgetTooltip(pdf: PDFDocument, widget: PDFDict, label: string): void {
  const encodedLabel = encodePdfTextString(label);
  widget.set(PDFName.of('TU'), encodedLabel);

  // Only the terminal field gets the tooltip; never a non-terminal ancestor
  // that groups several fields.
  const field = terminalFieldForWidget(pdf, widget);
  if (field !== widget && !readPdfText(field.get(PDFName.of('TU')))) {
    field.set(PDFName.of('TU'), encodedLabel);
  }
}

function applyFormLabelTooltips(pdf: PDFDocument, labels: Map<string, string>): boolean {
  if (labels.size === 0) return false;
  let changed = false;

  for (const page of pdf.getPages()) {
    const annotations = lookupMaybeArray(pdf, page.node.get(PDFName.of('Annots')));
    if (!annotations) continue;

    for (let index = 0; index < annotations.size(); index += 1) {
      const widget = lookupMaybeDict(pdf, annotations.get(index));
      if (!widget) continue;

      const subtype = widget.get(PDFName.of('Subtype'));
      if (!isPdfName(subtype, 'Widget')) continue;
      if (hasWidgetTooltip(pdf, widget)) continue;

      const fieldName = readFullFieldName(pdf, widget);
      const label = fieldName ? labels.get(fieldName) : undefined;
      if (!label) continue;

      setWidgetTooltip(pdf, widget, label);
      changed = true;
    }
  }

  return changed;
}

export interface BuildRemediatedPdfOptions {
  addInvisibleTextLayer?: boolean;
  strictPdfUa?: boolean;
  verapdfFeedback?: VerapdfResult;
  /**
   * Opt-in (experimental): tag an invisible Helvetica copy of the text of an
   * untagged, non-OCR document. Off by default, because the visible text
   * stays untagged and the copy cannot match it exactly; such documents get
   * metadata fixes only and stay analysis-only.
   */
  injectBoundTextLayer?: boolean;
  injectUnboundStructTree?: boolean;
}

function readExistingXmpPacket(pdf: PDFDocument): string | undefined {
  try {
    const stream = pdf.context.lookup(pdf.catalog.get(PDFName.of('Metadata')));
    if (!(stream instanceof PDFRawStream)) return undefined;
    const packet = new TextDecoder('utf-8', { fatal: true }).decode(decodePDFRawStream(stream).decode());
    return packet.includes('<x:xmpmeta') || packet.includes('<rdf:RDF') ? packet : undefined;
  } catch {
    return undefined;
  }
}

function shouldForceStrictMetadata(options: BuildRemediatedPdfOptions): boolean {
  if (options.strictPdfUa) return true;
  if (getVerapdfComplianceVerdict(options.verapdfFeedback) === false) return true;

  const failedRules = options.verapdfFeedback?.summary?.failedRules;
  if (typeof failedRules === 'number' && failedRules > 0) return true;

  const failedChecks = options.verapdfFeedback?.summary?.failedChecks;
  if (typeof failedChecks === 'number' && failedChecks > 0) return true;

  return false;
}

export async function buildRemediatedPdf(
  parsed: ParsedPDF,
  language: string,
  sourceBytes?: ArrayBuffer | Uint8Array,
  options: BuildRemediatedPdfOptions = {}
) {
  const chosenLanguage = language || parsed.language || 'en-US';
  const strictMetadata = shouldForceStrictMetadata(options);
  const plan = extractRemediationPlan(parsed);
  const sourcePdfUaPart = parsed.metadata['pdfuaid:part']?.trim();
  const hasBoundStructure = Boolean(parsed.structureBinding?.hasContentBinding);
  // A manifest means `parsed` is this tool's own earlier output. Its mode
  // was decided from the original source and sticks: structure this tool
  // injected (OCR text layer) never upgrades a file to content-bound.
  const remediationMode: RemediationMode =
    parsed.remediationMode === 'analysis-only'
      ? 'analysis-only'
      : hasBoundStructure
        ? 'content-bound'
        : 'analysis-only';
  // PDF/UA is claimed only when the source declared it, or when the source
  // itself has structure bound to its content. On a later pass the claim is
  // read back from what the earlier pass wrote, which followed this rule.
  const pdfUaPart = sourcePdfUaPart || (remediationMode === 'content-bound' ? '1' : undefined);
  // The language is assumed when the source had none (or an earlier pass
  // recorded the assumption in its manifest). The `language` argument is
  // never evidence: callers pass a default. OCR results copy the source
  // metadata but fill `language` with a default, so for them the source
  // /Lang (metadata.Language) or XMP dc:language decides.
  const sourceMetadataLanguage =
    parsed.metadata.Language ?? parsed.metadata.Lang ?? parsed.metadata['dc:language'];
  const languageAssumed =
    parsed.languageAssumed === true ||
    (parsed.remediationMode === undefined &&
      (!parsed.language || (Boolean(options.addInvisibleTextLayer) && !sourceMetadataLanguage)));

  const manifest = {
    version: 3,
    language: chosenLanguage,
    remediationMode,
    ...(pdfUaPart ? { pdfUaPart } : {}),
    ...(languageAssumed ? { languageAssumed: true } : {})
  };

  const loadableSourceBytes =
    sourceBytes instanceof Uint8Array
      ? sourceBytes.slice()
      : sourceBytes instanceof ArrayBuffer
        ? sourceBytes.slice(0)
        : undefined;

  const pdf =
    loadableSourceBytes instanceof Uint8Array || loadableSourceBytes instanceof ArrayBuffer
      ? await PDFDocument.load(loadableSourceBytes, { updateMetadata: false, ignoreEncryption: true })
      : await PDFDocument.create();
  // pdf-lib cannot decrypt: a restricted (owner-password) PDF would be
  // written back half-encrypted and unreadable. A signed PDF would lose its
  // signature. Refuse both with a clear error.
  assertNotEncrypted(pdf);
  assertNotSigned(pdf);

  if (!loadableSourceBytes) {
    const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
    const timesRoman = await pdf.embedFont(StandardFonts.TimesRoman);
    const courier = await pdf.embedFont(StandardFonts.Courier);

    for (let pageIndex = 0; pageIndex < Math.max(1, parsed.pageCount); pageIndex += 1) {
      const page = pdf.addPage();
      const pageText = plan.textItems.filter((item) => item.page === pageIndex + 1).slice(0, 300);
      for (const item of pageText) {
        const mapped = mapFontName(item.fontName);
        const font = mapped === 'TimesRoman' ? timesRoman : mapped === 'Courier' ? courier : helvetica;
        const safeText = sanitizeTextForFont(font, item.text);
        if (!safeText.trim()) continue;

        page.drawText(safeText, {
          x: Math.max(item.x, 20),
          y: Math.max(item.y, 20),
          size: Math.max(8, item.fontSize),
          font,
          color: parseColor(item.color)
        });
      }
    }
  }

  if (loadableSourceBytes && options.addInvisibleTextLayer) {
    const taggedItems = resolveTaggedLayerItems(parsed, plan, true);
    const bindings = await embedTaggedInvisibleTextLayer(pdf, taggedItems);
    if (bindings.length > 0) {
      injectBoundStructTreeFromBindings(pdf, bindings);
    }
  }

  if (!hasBoundStructure && options.injectBoundTextLayer === true && !options.addInvisibleTextLayer) {
    const taggedItems = resolveTaggedLayerItems(parsed, plan, false);
    const bindings = await embedTaggedInvisibleTextLayer(pdf, taggedItems);
    if (bindings.length > 0) {
      injectBoundStructTreeFromBindings(pdf, bindings);
    }
  }

  if (hasBoundStructure || pdf.catalog.get(PDFName.of('StructTreeRoot'))) {
    applyStructureTabOrder(pdf);
  }

  if (hasBoundStructure) {
    normalizeBoundStructureHeadings(pdf);
  }

  if (parsed.outlines.length === 0) {
    injectOutlineFromHeadings(pdf, plan.headings);
  }

  applyFormLabelTooltips(pdf, inferFormLabels(parsed));

  const existingKeywords = new Set(
    [...splitKeywords(safeReadPdfMetadata(() => pdf.getKeywords())), ...splitKeywords(parsed.metadata.Keywords)].filter(
      (keyword) => !keyword.includes(MANIFEST_PREFIX)
    )
  );
  const encodedManifest = encodeManifest(manifest);
  existingKeywords.add(encodedManifest);

  // Existing values are kept and missing ones stay missing: a placeholder
  // title or author would hide the problem from the audit and from readers.
  const metadataTitle = parsed.title ?? safeReadPdfMetadata(() => pdf.getTitle());
  const metadataAuthor = parsed.metadata.Author ?? safeReadPdfMetadata(() => pdf.getAuthor());
  const metadataSubject = parsed.metadata.Subject ?? safeReadPdfMetadata(() => pdf.getSubject());
  const metadataCreator = parsed.metadata.Creator ?? safeReadPdfMetadata(() => pdf.getCreator());

  // PDF/UA needs /Lang; when it was not in the source, the manifest records
  // that it was assumed so the audit asks a person to confirm it.
  pdf.setLanguage(chosenLanguage);
  if (metadataTitle) pdf.setTitle(metadataTitle);
  if (metadataAuthor) pdf.setAuthor(metadataAuthor);
  if (metadataSubject) pdf.setSubject(metadataSubject);
  // /Creator names the authoring application and is left alone.
  pdf.setProducer('PDF Remediator');

  if (strictMetadata) {
    // Display document title in viewers. Other viewer preferences are kept.
    const existingViewerPreferences = lookupMaybeDict(pdf, pdf.catalog.get(PDFName.of('ViewerPreferences')));
    const viewerPreferences = existingViewerPreferences ?? pdf.context.obj({});
    viewerPreferences.set(PDFName.of('DisplayDocTitle'), PDFBool.True);
    if (!existingViewerPreferences) {
      pdf.catalog.set(PDFName.of('ViewerPreferences'), pdf.context.register(viewerPreferences));
    }
  }

  pdf.setKeywords([...existingKeywords]);

  const modifiedAt = new Date();
  pdf.setModificationDate(modifiedAt);
  const xmpBytes = buildXmpMetadata(
    {
      title: metadataTitle,
      author: metadataAuthor,
      subject: metadataSubject,
      keywords: [...existingKeywords].join(' '),
      language: chosenLanguage,
      creatorTool: metadataCreator,
      producer: 'PDF Remediator',
      createdAt: safeReadPdfDate(() => pdf.getCreationDate()),
      modifiedAt,
      pdfUaPart
    },
    readExistingXmpPacket(pdf)
  );
  const metadataStream = pdf.context.stream(xmpBytes, { Type: 'Metadata', Subtype: 'XML' });
  pdf.catalog.set(PDFName.of('Metadata'), pdf.context.register(metadataStream));

  // Legacy opt-in path for unbound StructElem generation (kept for experiments only).
  if (options.injectUnboundStructTree) {
    const tagTree = buildTagTree(plan);
    injectStructTree(pdf, tagTree);
  }

  return pdf.save();
}
