import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFRawStream,
  PDFRef
} from 'pdf-lib';
import { assertNotEncrypted } from '@/lib/pdf/encryption';
import { binaryStringToBytes, encodePdfTextString } from './pdf-text';
import { decodePageContent, maxMcidInContent } from './page-content';

/**
 * Applies reviewer-drafted image descriptions to a PDF by wrapping each
 * image paint operation in a real marked-content sequence and binding a
 * Figure structure element (with /Alt) into the structure tree and
 * ParentTree. Decorative images are wrapped as /Artifact instead.
 *
 * Images that already sit inside a Figure marked-content sequence with an
 * MCID are not wrapped again: the existing Figure structure element is
 * found through the ParentTree and its /Alt is set in place.
 *
 * The transform is conservative: any page whose content cannot be matched
 * to the parsed image list unambiguously is skipped and reported, never
 * guessed. Input bytes are not mutated; a new PDF is returned.
 */

export interface ManualAltTextApplication {
  /** Parser image id, e.g. "img-2-1" (page 2, first painted image). */
  imageId: string;
  alt: string;
  decorative: boolean;
}

export interface ApplyAltTextOutcome {
  bytes: Uint8Array;
  applied: string[];
  skipped: Array<{ imageId: string; reason: string }>;
}

interface PageEntry extends ManualAltTextApplication {
  /** 1-based paint order within the page. */
  order: number;
}

interface PaintOccurrence {
  start: number;
  end: number;
}

interface MarkedContentEntry {
  tag: string;
  mcid?: number;
}

const IMAGE_ID_PATTERN = /^img-(\d+)-(\d+)$/;

function parseImageId(imageId: string): { page: number; order: number } | undefined {
  const match = imageId.match(IMAGE_ID_PATTERN);
  if (!match) return undefined;
  const page = Number(match[1]);
  const order = Number(match[2]);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(order) || order < 1) return undefined;
  return { page, order };
}

function lookupDict(pdf: PDFDocument, value: unknown): PDFDict | undefined {
  if (!value) return undefined;
  if (value instanceof PDFDict) return value;
  try {
    const resolved = pdf.context.lookup(value as Parameters<typeof pdf.context.lookup>[0]);
    return resolved instanceof PDFDict ? resolved : undefined;
  } catch {
    return undefined;
  }
}

function lookupArray(pdf: PDFDocument, value: unknown): PDFArray | undefined {
  if (!value) return undefined;
  if (value instanceof PDFArray) return value;
  try {
    const resolved = pdf.context.lookup(value as Parameters<typeof pdf.context.lookup>[0]);
    return resolved instanceof PDFArray ? resolved : undefined;
  } catch {
    return undefined;
  }
}

function imageXObjectNames(pdf: PDFDocument, page: ReturnType<PDFDocument['getPages']>[number]): Set<string> {
  const names = new Set<string>();
  const resources = lookupDict(pdf, page.node.get(PDFName.of('Resources')));
  const xobjects = resources ? lookupDict(pdf, resources.get(PDFName.of('XObject'))) : undefined;
  if (!xobjects) return names;

  for (const [key, value] of xobjects.entries()) {
    try {
      const stream = pdf.context.lookup(value);
      const dict =
        stream instanceof PDFRawStream ? stream.dict : stream instanceof PDFDict ? stream : undefined;
      const subtype = dict?.get(PDFName.of('Subtype'));
      if (subtype instanceof PDFName && subtype.toString() === '/Image') {
        names.add(key.toString().slice(1));
      }
    } catch {
      // Unresolvable XObject entries cannot be image paints we can match.
    }
  }

  return names;
}

function findInlineImageBlocks(content: string): PaintOccurrence[] {
  const blocks: PaintOccurrence[] = [];
  const inlinePattern = /(^|[\s>])BI[\s/][\s\S]*?\sEI(?=[\s%]|$)/g;
  let inlineMatch: RegExpExecArray | null;
  while ((inlineMatch = inlinePattern.exec(content))) {
    const lead = inlineMatch[1] ? inlineMatch[1].length : 0;
    blocks.push({ start: inlineMatch.index + lead, end: inlineMatch.index + inlineMatch[0].length });
  }
  return blocks;
}

/**
 * Finds top-level image paint occurrences (XObject Do calls and inline
 * BI..EI images) in document order. Returns undefined when the content
 * contains constructs that make safe matching impossible.
 */
function findImagePaints(content: string, imageNames: Set<string>, blocks: PaintOccurrence[]): PaintOccurrence[] {
  const occurrences: PaintOccurrence[] = [];
  const inInlineBlock = (index: number) => blocks.some((block) => index >= block.start && index < block.end);

  const doPattern = /\/([^\s/<>[\]()]+)\s+Do(?![\w])/g;
  let doMatch: RegExpExecArray | null;
  while ((doMatch = doPattern.exec(content))) {
    if (inInlineBlock(doMatch.index)) continue;
    if (!imageNames.has(doMatch[1] ?? '')) continue;
    occurrences.push({ start: doMatch.index, end: doMatch.index + doMatch[0].length });
  }

  return [...occurrences, ...blocks].sort((a, b) => a.start - b.start);
}

const PDF_WHITESPACE = new Set(['\0', '\t', '\n', '\f', '\r', ' ']);
const PDF_DELIMITERS = new Set(['(', ')', '<', '>', '[', ']', '{', '}', '/', '%']);

function parseMarkedContentOperands(operands: string): MarkedContentEntry {
  const tag = operands.match(/^\s*\/([^\s/<>[\]()]+)/)?.[1] ?? '';
  const mcidMatch = operands.match(/\/MCID\s+(\d+)/);
  return mcidMatch ? { tag, mcid: Number(mcidMatch[1]) } : { tag };
}

/**
 * Lexes a content stream far enough to track the marked-content stack
 * (BMC/BDC/EMC), skipping strings, comments and inline image data, and
 * returns a snapshot of that stack at each target offset.
 */
function markedContentStacksAt(
  content: string,
  targets: number[],
  skipRanges: PaintOccurrence[]
): MarkedContentEntry[][] {
  const order = targets.map((target, index) => ({ target, index })).sort((a, b) => a.target - b.target);
  const snapshots: MarkedContentEntry[][] = targets.map(() => []);
  const stack: MarkedContentEntry[] = [];
  const skips = [...skipRanges].sort((a, b) => a.start - b.start);
  let nextTarget = 0;
  let skipIndex = 0;
  let operandStart = 0;
  let i = 0;

  const recordUpTo = (position: number) => {
    while (nextTarget < order.length && order[nextTarget]!.target <= position) {
      snapshots[order[nextTarget]!.index] = [...stack];
      nextTarget += 1;
    }
  };

  while (i < content.length) {
    while (skipIndex < skips.length && skips[skipIndex]!.end <= i) skipIndex += 1;
    const skip = skips[skipIndex];
    if (skip && i >= skip.start) {
      recordUpTo(skip.start);
      i = skip.end;
      operandStart = i;
      continue;
    }

    const char = content[i]!;
    if (PDF_WHITESPACE.has(char)) {
      i += 1;
      continue;
    }

    recordUpTo(i);

    if (char === '%') {
      while (i < content.length && content[i] !== '\n' && content[i] !== '\r') i += 1;
      continue;
    }
    if (char === '(') {
      let depth = 0;
      while (i < content.length) {
        const current = content[i]!;
        if (current === '\\') {
          i += 2;
          continue;
        }
        if (current === '(') depth += 1;
        if (current === ')') {
          depth -= 1;
          if (depth === 0) {
            i += 1;
            break;
          }
        }
        i += 1;
      }
      continue;
    }
    if (char === '<') {
      if (content[i + 1] === '<') {
        i += 2;
        continue;
      }
      const close = content.indexOf('>', i + 1);
      i = close < 0 ? content.length : close + 1;
      continue;
    }
    if (char === '>' || char === '[' || char === ']' || char === '{' || char === '}' || char === ')') {
      i += char === '>' && content[i + 1] === '>' ? 2 : 1;
      continue;
    }

    const tokenStart = i;
    if (char === '/') i += 1;
    while (i < content.length && !PDF_WHITESPACE.has(content[i]!) && !PDF_DELIMITERS.has(content[i]!)) i += 1;
    if (i === tokenStart) {
      i += 1;
      continue;
    }
    const token = content.slice(tokenStart, i);
    if (char === '/' || /^[+-]?(\d+\.?\d*|\.\d+)$/.test(token) || token === 'true' || token === 'false' || token === 'null') {
      continue;
    }

    // Any other bare token is an operator.
    if (token === 'BDC' || token === 'BMC') {
      stack.push(parseMarkedContentOperands(content.slice(operandStart, tokenStart)));
    } else if (token === 'EMC') {
      stack.pop();
    }
    operandStart = i;
  }

  recordUpTo(Number.POSITIVE_INFINITY);
  return snapshots;
}

function maxExistingMcid(content: string, parentArray: PDFArray | undefined): number {
  let max = maxMcidInContent(content);
  if (parentArray) {
    max = Math.max(max, parentArray.size() - 1);
  }
  return max;
}

interface StructTreeHandles {
  rootDict: PDFDict;
  parentRef: PDFRef;
  parentKids: PDFArray;
  nums: PDFArray;
  nextKey: number;
}

/**
 * Resolves (or creates) the structure tree pieces needed to attach Figure
 * elements. Returns undefined when the existing tree uses a shape this
 * transform does not understand — callers must then skip rather than guess.
 */
function resolveStructTree(pdf: PDFDocument): StructTreeHandles | undefined {
  const context = pdf.context;
  const rootValue = pdf.catalog.get(PDFName.of('StructTreeRoot'));

  if (!rootValue) {
    const markInfoDict = context.obj({ Marked: true });
    pdf.catalog.set(PDFName.of('MarkInfo'), context.register(markInfoDict));

    const rootDict = context.obj({ Type: 'StructTreeRoot' });
    const rootRef = context.register(rootDict);

    const documentDict = context.obj({ Type: 'StructElem', S: 'Document' });
    documentDict.set(PDFName.of('P'), rootRef);
    const documentRef = context.register(documentDict);
    const kids = PDFArray.withContext(context);
    documentDict.set(PDFName.of('K'), kids);
    rootDict.set(PDFName.of('K'), documentRef);

    const nums = PDFArray.withContext(context);
    const parentTreeDict = context.obj({ Nums: nums });
    rootDict.set(PDFName.of('ParentTree'), context.register(parentTreeDict));
    rootDict.set(PDFName.of('ParentTreeNextKey'), PDFNumber.of(0));
    pdf.catalog.set(PDFName.of('StructTreeRoot'), rootRef);

    return { rootDict, parentRef: documentRef, parentKids: kids, nums, nextKey: 0 };
  }

  const rootDict = lookupDict(pdf, rootValue);
  if (!rootDict) return undefined;

  // Figures attach under the document-level element when the root has a
  // single child; otherwise directly under the root's kid array.
  const rootK = rootDict.get(PDFName.of('K'));
  let parentRef: PDFRef | undefined;
  let parentDict: PDFDict | undefined;

  if (rootK instanceof PDFRef) {
    parentRef = rootK;
    parentDict = lookupDict(pdf, rootK);
  }
  if (!parentRef || !parentDict) return undefined;

  let parentKids: PDFArray;
  const existingK = parentDict.get(PDFName.of('K'));
  if (existingK instanceof PDFArray) {
    parentKids = existingK;
  } else if (existingK !== undefined) {
    parentKids = PDFArray.withContext(pdf.context);
    parentKids.push(existingK);
    parentDict.set(PDFName.of('K'), parentKids);
  } else {
    parentKids = PDFArray.withContext(pdf.context);
    parentDict.set(PDFName.of('K'), parentKids);
  }

  const parentTreeDict = lookupDict(pdf, rootDict.get(PDFName.of('ParentTree')));
  if (!parentTreeDict) return undefined;
  const nums = lookupArray(pdf, parentTreeDict.get(PDFName.of('Nums')));
  // Number trees with /Kids are out of scope; skip rather than corrupt.
  if (!nums) return undefined;

  // Never trust ParentTreeNextKey alone: a stale value would hand out a key
  // that is already in use and silently rebind another page's content.
  let nextKey = 0;
  const nextKeyValue = rootDict.get(PDFName.of('ParentTreeNextKey'));
  if (nextKeyValue instanceof PDFNumber) nextKey = Math.max(0, nextKeyValue.asNumber());
  for (let i = 0; i < nums.size(); i += 2) {
    const key = nums.get(i);
    if (key instanceof PDFNumber) nextKey = Math.max(nextKey, key.asNumber() + 1);
  }
  for (const page of pdf.getPages()) {
    const structParents = page.node.get(PDFName.of('StructParents'));
    if (structParents instanceof PDFNumber) nextKey = Math.max(nextKey, structParents.asNumber() + 1);
  }
  rootDict.set(PDFName.of('ParentTreeNextKey'), PDFNumber.of(nextKey));

  return { rootDict, parentRef, parentKids, nums, nextKey };
}

function parentArrayForPage(
  pdf: PDFDocument,
  tree: StructTreeHandles,
  page: ReturnType<PDFDocument['getPages']>[number]
): PDFArray | undefined {
  const structParents = page.node.get(PDFName.of('StructParents'));
  if (!(structParents instanceof PDFNumber)) return undefined;
  const key = structParents.asNumber();
  for (let i = 0; i + 1 < tree.nums.size(); i += 2) {
    const numKey = tree.nums.get(i);
    if (numKey instanceof PDFNumber && numKey.asNumber() === key) {
      return lookupArray(pdf, tree.nums.get(i + 1));
    }
  }
  return undefined;
}

function ensureParentArrayForPage(
  pdf: PDFDocument,
  tree: StructTreeHandles,
  page: ReturnType<PDFDocument['getPages']>[number]
): PDFArray {
  const existing = parentArrayForPage(pdf, tree, page);
  if (existing) return existing;

  const context = pdf.context;
  const key = tree.nextKey;
  tree.nextKey += 1;
  page.node.set(PDFName.of('StructParents'), PDFNumber.of(key));

  const parentArray = PDFArray.withContext(context);
  tree.nums.push(PDFNumber.of(key));
  tree.nums.push(context.register(parentArray));
  tree.rootDict.set(PDFName.of('ParentTreeNextKey'), PDFNumber.of(tree.nextKey));
  return parentArray;
}

function createFigureElement(
  pdf: PDFDocument,
  tree: StructTreeHandles,
  page: ReturnType<PDFDocument['getPages']>[number],
  mcid: number,
  alt: string
): PDFRef {
  const context = pdf.context;
  const figureDict = context.obj({ Type: 'StructElem', S: 'Figure' });
  figureDict.set(PDFName.of('P'), tree.parentRef);
  figureDict.set(PDFName.of('Pg'), page.ref);
  figureDict.set(PDFName.of('K'), PDFNumber.of(mcid));
  figureDict.set(PDFName.of('Alt'), encodePdfTextString(alt));
  const figureRef = context.register(figureDict);
  tree.parentKids.push(figureRef);
  return figureRef;
}

export async function applyManualAltText(
  sourceBytes: ArrayBuffer | Uint8Array,
  applications: ManualAltTextApplication[],
  pageImageCounts: Record<number, number>
): Promise<ApplyAltTextOutcome> {
  const skipped: Array<{ imageId: string; reason: string }> = [];
  const applied: string[] = [];

  const entriesByPage = new Map<number, PageEntry[]>();
  for (const application of applications) {
    const parsedId = parseImageId(application.imageId);
    if (!parsedId) {
      skipped.push({ imageId: application.imageId, reason: 'Unrecognized image reference.' });
      continue;
    }
    const bucket = entriesByPage.get(parsedId.page) ?? [];
    bucket.push({ ...application, order: parsedId.order });
    entriesByPage.set(parsedId.page, bucket);
  }

  const loadable = sourceBytes instanceof Uint8Array ? sourceBytes.slice() : sourceBytes.slice(0);
  const pdf = await PDFDocument.load(loadable, { updateMetadata: false, ignoreEncryption: true });
  assertNotEncrypted(pdf);
  const pages = pdf.getPages();
  const context = pdf.context;

  const skipPage = (pageEntries: PageEntry[], reason: string) => {
    for (const entry of pageEntries) skipped.push({ imageId: entry.imageId, reason });
  };

  const tree = resolveStructTree(pdf);

  for (const [pageNumber, pageEntries] of [...entriesByPage.entries()].sort((a, b) => a[0] - b[0])) {
    const page = pages[pageNumber - 1];
    if (!page) {
      skipPage(pageEntries, 'Page not found in the PDF.');
      continue;
    }
    if (!tree) {
      skipPage(pageEntries, 'The PDF structure tree uses a layout this app cannot safely extend. Apply in Acrobat.');
      continue;
    }

    const content = decodePageContent(pdf, page);
    if (content === undefined) {
      skipPage(pageEntries, 'Page content could not be read for tagging. Apply in Acrobat.');
      continue;
    }

    const inlineBlocks = findInlineImageBlocks(content);
    const paints = findImagePaints(content, imageXObjectNames(pdf, page), inlineBlocks);
    const expectedCount = pageImageCounts[pageNumber];
    if (typeof expectedCount !== 'number' || paints.length !== expectedCount) {
      skipPage(
        pageEntries,
        'Images on this page are drawn through nested graphics the app cannot match safely. Apply in Acrobat.'
      );
      continue;
    }

    const parentArray = ensureParentArrayForPage(pdf, tree, page);
    let nextMcid = maxExistingMcid(content, parentArray) + 1;
    const enclosingMarks = markedContentStacksAt(
      content,
      paints.map((paint) => paint.start),
      inlineBlocks
    );

    const matched = pageEntries.filter((entry) => {
      if (entry.order >= 1 && entry.order <= paints.length) return true;
      skipped.push({ imageId: entry.imageId, reason: 'Image not found on this page anymore.' });
      return false;
    });

    // Images already inside marked content are never wrapped a second time:
    // nested MCIDs are invalid and would leave the original Figure without
    // /Alt. Existing Figures get their /Alt set through the ParentTree.
    const toWrap: PageEntry[] = [];
    for (const entry of matched.sort((a, b) => a.order - b.order)) {
      const marks = enclosingMarks[entry.order - 1] ?? [];
      const inArtifact = marks.some((mark) => mark.tag === 'Artifact');
      const tagged = [...marks].reverse().find((mark) => typeof mark.mcid === 'number');

      if (inArtifact) {
        if (entry.decorative) {
          applied.push(entry.imageId);
        } else {
          skipped.push({
            imageId: entry.imageId,
            reason: 'This image is marked as a decorative artifact in the PDF. Retag it in Acrobat to describe it.'
          });
        }
        continue;
      }

      if (!tagged) {
        toWrap.push(entry);
        continue;
      }

      if (entry.decorative) {
        skipped.push({
          imageId: entry.imageId,
          reason: 'This image is already tagged in the PDF. Mark it as an artifact in Acrobat.'
        });
        continue;
      }

      const mcid = tagged.mcid!;
      const existingElem = mcid < parentArray.size() ? lookupDict(pdf, parentArray.get(mcid)) : undefined;
      if (existingElem) {
        const role = existingElem.get(PDFName.of('S'));
        if (!(role instanceof PDFName) || role.toString() !== '/Figure') {
          skipped.push({
            imageId: entry.imageId,
            reason: 'This image is tagged inside non-Figure content. Retag it as a Figure in Acrobat.'
          });
          continue;
        }
        existingElem.set(PDFName.of('Alt'), encodePdfTextString(entry.alt));
        applied.push(entry.imageId);
        continue;
      }

      if (tagged.tag !== 'Figure') {
        skipped.push({
          imageId: entry.imageId,
          reason: 'This image is tagged inside non-Figure content. Retag it as a Figure in Acrobat.'
        });
        continue;
      }

      // Figure-marked content with no structure element yet: bind one to
      // the existing MCID rather than adding a second marked-content layer.
      const figureRef = createFigureElement(pdf, tree, page, mcid, entry.alt);
      while (parentArray.size() <= mcid) parentArray.push(PDFNull);
      parentArray.set(mcid, figureRef);
      applied.push(entry.imageId);
    }

    // Assign MCIDs in paint order so the structure tree reads in document
    // order, then rewrite from the last occurrence backwards so byte
    // offsets stay valid.
    const planned = toWrap.map((entry) => ({ entry, mcid: entry.decorative ? -1 : nextMcid++ }));

    let nextContent = content;
    const figureBindings: Array<{ mcid: number; alt: string; imageId: string }> = [];

    for (const { entry, mcid } of [...planned].sort((a, b) => b.entry.order - a.entry.order)) {
      const paint = paints[entry.order - 1]!;
      if (entry.decorative) {
        nextContent = `${nextContent.slice(0, paint.start)}/Artifact BMC\n${nextContent.slice(paint.start, paint.end)}\nEMC${nextContent.slice(paint.end)}`;
        applied.push(entry.imageId);
        continue;
      }

      nextContent = `${nextContent.slice(0, paint.start)}/Figure <</MCID ${mcid}>> BDC\n${nextContent.slice(paint.start, paint.end)}\nEMC${nextContent.slice(paint.end)}`;
      figureBindings.push({ mcid, alt: entry.alt, imageId: entry.imageId });
      applied.push(entry.imageId);
    }

    if (nextContent === content) continue;

    const newStream = context.flateStream(binaryStringToBytes(nextContent));
    page.node.set(PDFName.of('Contents'), context.register(newStream));

    for (const binding of figureBindings.sort((a, b) => a.mcid - b.mcid)) {
      const figureRef = createFigureElement(pdf, tree, page, binding.mcid, binding.alt);
      while (parentArray.size() <= binding.mcid) {
        parentArray.push(PDFNull);
      }
      parentArray.set(binding.mcid, figureRef);
    }
  }

  const bytes = await pdf.save();
  return { bytes, applied, skipped };
}
