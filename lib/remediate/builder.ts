import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames,
  StandardFonts,
  TextRenderingMode,
  beginText,
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
import { mapFontName } from './font-mapper';
import { buildTagTree } from './tagger';
import { injectStructTree } from './struct-tree';
import { encodeManifest, MANIFEST_PREFIX } from './manifest';
import type { VerapdfResult } from '@/lib/verapdf/types';

const MAX_OCR_TEXT_LAYER_ITEMS = 20000;
const MAX_TAGGED_TEXT_ITEMS = 1200;
const MAX_TAGGED_TEXT_LENGTH = 500;

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

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function shortMatchKey(value: string): string {
  return normalizeText(value).toLowerCase().slice(0, 40);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
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
  const pageAnchors = new Map<number, typeof parsed.textItems>();
  const fallbackCursor = new Map<number, number>();

  for (const textItem of parsed.textItems) {
    let bucket = pageAnchors.get(textItem.page);
    if (!bucket) {
      bucket = [];
      pageAnchors.set(textItem.page, bucket);
    }
    bucket.push(textItem);
  }

  function locateAnchor(page: number, text: string) {
    const anchors = pageAnchors.get(page) ?? [];
    const key = shortMatchKey(text);
    if (!key) return undefined;

    return anchors.find((anchor) => {
      const anchorKey = shortMatchKey(anchor.text);
      return Boolean(anchorKey && (anchorKey.includes(key) || key.includes(anchorKey)));
    });
  }

  function pushItem(role: string, page: number, rawText: string, x?: number, y?: number, fontSize?: number) {
    const text = normalizeText(rawText).slice(0, MAX_TAGGED_TEXT_LENGTH);
    if (!text) return;
    if (page < 1 || page > parsed.pageCount) return;

    const dedupeKey = `${role}|${page}|${shortMatchKey(text)}`;
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
      if (items.length >= MAX_TAGGED_TEXT_ITEMS) break;
    }
    return items;
  }

  for (const heading of plan.headings) {
    const anchor = locateAnchor(heading.page, heading.text);
    const role = `H${Math.max(1, Math.min(6, heading.level))}`;
    pushItem(role, heading.page, heading.text, anchor?.x, anchor?.y, anchor?.fontSize);
    if (items.length >= MAX_TAGGED_TEXT_ITEMS) return items;
  }

  for (const paragraph of plan.paragraphs) {
    const anchor = locateAnchor(paragraph.page, paragraph.text);
    pushItem('P', paragraph.page, paragraph.text, anchor?.x, anchor?.y, anchor?.fontSize);
    if (items.length >= MAX_TAGGED_TEXT_ITEMS) return items;
  }

  if (items.length < 80) {
    for (const item of parsed.textItems.slice(0, MAX_TAGGED_TEXT_ITEMS)) {
      pushItem('P', item.page, item.text, item.x, item.y, item.fontSize);
      if (items.length >= MAX_TAGGED_TEXT_ITEMS) break;
    }
  }

  return items;
}

function beginMarkedContentSequence(tag: string, mcid: number, context: PDFDocument['context']): PDFOperator {
  const props = context.obj({ MCID: PDFNumber.of(mcid) }) as PDFDict;
  return PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of(tag), props as any]);
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
    const key = (page as any).node.newFontDictionary('F', font.ref) as PDFName;
    fontKeyByPage.set(pageNumber, key);
    return key;
  }

  for (const item of items) {
    const page = pages[item.page - 1];
    if (!page) continue;

    const safeText = sanitizeTextForFont(font, item.text).trim();
    if (!safeText) continue;

    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const x = clamp(item.x, 0, Math.max(0, pageWidth - 1));
    const y = clamp(item.y, 0, Math.max(0, pageHeight - 1));
    const size = Math.max(6, Math.min(item.fontSize, 72));
    const fontKey = fontResourceForPage(item.page, page);
    const mcid = nextMcidByPage.get(item.page) ?? 0;
    nextMcidByPage.set(item.page, mcid + 1);

    page.pushOperators(
      pushGraphicsState(),
      beginMarkedContentSequence('Span', mcid, pdf.context),
      beginText(),
      setTextRenderingMode(TextRenderingMode.Invisible),
      setFontAndSize(fontKey, size),
      setTextMatrix(1, 0, 0, 1, x, y),
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

  const markInfoDict = context.obj({ Marked: true });
  const markInfoRef = context.register(markInfoDict);
  pdf.catalog.set(PDFName.of('MarkInfo'), markInfoRef);

  const structTreeRootDict = context.obj({ Type: 'StructTreeRoot' });
  const structTreeRootRef = context.register(structTreeRootDict);

  const roleMapDict = context.obj({
    Document: 'Document',
    Sect: 'Sect',
    H1: 'H1',
    H2: 'H2',
    H3: 'H3',
    H4: 'H4',
    H5: 'H5',
    H6: 'H6',
    P: 'P',
    Span: 'Span',
    L: 'L',
    LI: 'LI',
    Lbl: 'Lbl',
    LBody: 'LBody',
    Table: 'Table',
    TR: 'TR',
    TH: 'TH',
    TD: 'TD',
    Figure: 'Figure'
  });
  structTreeRootDict.set(PDFName.of('RoleMap'), roleMapDict);

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

export interface BuildRemediatedPdfOptions {
  addInvisibleTextLayer?: boolean;
  strictPdfUa?: boolean;
  verapdfFeedback?: VerapdfResult;
  injectBoundTextLayer?: boolean;
  injectUnboundStructTree?: boolean;
}

function shouldForceStrictMetadata(options: BuildRemediatedPdfOptions): boolean {
  if (options.strictPdfUa) return true;
  if (options.verapdfFeedback?.compliant === false) return true;

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
  const remediationMode: RemediationMode =
    parsed.remediationMode === 'analysis-only'
      ? 'analysis-only'
      : hasBoundStructure
        ? 'content-bound'
        : 'analysis-only';

  const manifest = {
    version: 3,
    language: chosenLanguage,
    remediationMode,
    ...(sourcePdfUaPart
      ? { pdfUaPart: sourcePdfUaPart }
      : hasBoundStructure
        ? { pdfUaPart: '1' }
        : {})
  };

  const pdf =
    sourceBytes instanceof Uint8Array || sourceBytes instanceof ArrayBuffer
      ? await PDFDocument.load(sourceBytes, { updateMetadata: false, ignoreEncryption: true })
      : await PDFDocument.create();

  if (!sourceBytes) {
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

  if (sourceBytes && options.addInvisibleTextLayer) {
    const taggedItems = resolveTaggedLayerItems(parsed, plan, true);
    const bindings = await embedTaggedInvisibleTextLayer(pdf, taggedItems);
    if (bindings.length > 0) {
      injectBoundStructTreeFromBindings(pdf, bindings);
    }
  }

  if (!hasBoundStructure && options.injectBoundTextLayer !== false && !options.addInvisibleTextLayer) {
    const taggedItems = resolveTaggedLayerItems(parsed, plan, false);
    const bindings = await embedTaggedInvisibleTextLayer(pdf, taggedItems);
    if (bindings.length > 0) {
      injectBoundStructTreeFromBindings(pdf, bindings);
    }
  }

  const existingKeywords = new Set(
    [...splitKeywords(safeReadPdfMetadata(() => pdf.getKeywords())), ...splitKeywords(parsed.metadata.Keywords)].filter(
      (keyword) => !keyword.includes(MANIFEST_PREFIX)
    )
  );
  existingKeywords.add('accessible');
  existingKeywords.add('wcag');
  existingKeywords.add('remediated');
  const encodedManifest = encodeManifest(manifest);
  existingKeywords.add(encodedManifest);

  const metadataTitle = parsed.title ?? safeReadPdfMetadata(() => pdf.getTitle()) ?? 'Accessible remediated PDF';
  const metadataAuthor =
    parsed.metadata.Author ?? safeReadPdfMetadata(() => pdf.getAuthor()) ?? 'PDF Remediator';
  const metadataSubject =
    parsed.metadata.Subject ?? safeReadPdfMetadata(() => pdf.getSubject()) ?? 'Accessibility remediated document';

  pdf.setLanguage(chosenLanguage);
  pdf.setTitle(metadataTitle);
  pdf.setAuthor(metadataAuthor);
  pdf.setSubject(metadataSubject);
  pdf.setCreator('PDF Remediator');
  pdf.setProducer('PDF Remediator');

  if (strictMetadata) {
    // Display document title in viewers and keep metadata explicit for stricter validators.
    const viewerPreferences = pdf.context.obj({ DisplayDocTitle: true });
    const viewerPreferencesRef = pdf.context.register(viewerPreferences);
    pdf.catalog.set(PDFName.of('ViewerPreferences'), viewerPreferencesRef);
  }

  pdf.setKeywords([...existingKeywords]);

  // Legacy opt-in path for unbound StructElem generation (kept for experiments only).
  if (options.injectUnboundStructTree) {
    const tagTree = buildTagTree(plan);
    injectStructTree(pdf, tagTree);
  }

  return pdf.save();
}
