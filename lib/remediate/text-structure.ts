import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFName, PDFNull, PDFNumber, PDFObject, PDFRef } from 'pdf-lib';
import { decodePageContent, maxMcidInContent } from './page-content';
import { OcrStructureError } from '@/lib/pdf/pdf-errors';

export interface TextBinding { role: string; page: number; mcid: number }

const MAX_MCID = 100_000;

/** Preflight every existing binding before adding any OCR operators. */
export function prepareTextStructure(pdf: PDFDocument, pageNumbers: number[]) {
  const ctx = pdf.context;
  const resolve = (value: PDFObject | undefined): PDFObject | undefined => value instanceof PDFRef ? ctx.lookup(value) : value;
  const dict = (value: PDFObject | undefined): PDFDict => {
    const found = resolve(value);
    if (!(found instanceof PDFDict)) throw new OcrStructureError();
    return found;
  };
  const entries = new Map<number, PDFObject>();
  const seen = new Set<PDFDict>();
  function readNumberTree(value: PDFObject): void {
    const node = dict(value);
    if (seen.has(node) || seen.size >= 10_000) throw new OcrStructureError();
    seen.add(node);
    const nums = resolve(node.get(PDFName.of('Nums')));
    const kids = resolve(node.get(PDFName.of('Kids')));
    if (nums instanceof PDFArray && kids === undefined) {
      if (nums.size() % 2 !== 0) throw new OcrStructureError();
      for (let i = 0; i < nums.size(); i += 2) {
        const key = resolve(nums.get(i));
        if (!(key instanceof PDFNumber) || !Number.isSafeInteger(key.asNumber()) || key.asNumber() < 0 || entries.has(key.asNumber())) {
          throw new OcrStructureError();
        }
        if (entries.size >= MAX_MCID) throw new OcrStructureError();
        entries.set(key.asNumber(), nums.get(i + 1));
      }
    } else if (kids instanceof PDFArray && nums === undefined) {
      for (let i = 0; i < kids.size(); i += 1) readNumberTree(kids.get(i));
    } else throw new OcrStructureError();
  }

  const existingRoot = pdf.catalog.get(PDFName.of('StructTreeRoot'));
  const root = existingRoot ? dict(existingRoot) : ctx.obj({ Type: 'StructTreeRoot' });
  // An existing root must already be indirect, so all existing /P links remain valid.
  if (existingRoot && !(existingRoot instanceof PDFRef)) throw new OcrStructureError();
  const rootRef = existingRoot instanceof PDFRef ? existingRoot : ctx.register(root);
  const existingK = root.get(PDFName.of('K'));
  const rootKids = resolve(existingK);
  const candidates = rootKids instanceof PDFArray ? rootKids.asArray() : existingK ? [existingK] : [];
  for (const kid of candidates) {
    if (!(resolve(kid) instanceof PDFDict)) throw new OcrStructureError();
  }
  const documentRef = candidates.length === 1 && candidates[0] instanceof PDFRef &&
    dict(candidates[0]).get(PDFName.of('S'))?.toString() === '/Document' ? candidates[0] : undefined;
  const parent = documentRef ? dict(documentRef) : ctx.obj({ Type: 'StructElem', S: 'Document', P: rootRef });
  const parentRef = documentRef ?? ctx.register(parent);
  const oldChildren = parent.get(PDFName.of('K'));
  const resolvedChildren = resolve(oldChildren);
  const children = PDFArray.withContext(ctx);
  if (resolvedChildren instanceof PDFArray) resolvedChildren.asArray().forEach((kid) => children.push(kid));
  else if (oldChildren) children.push(oldChildren);

  const parentTree = root.get(PDFName.of('ParentTree'));
  if (parentTree) readNumberTree(parentTree);
  const pages = pdf.getPages();
  const pageKeys = new Map<number, number>();
  const usedPageKeys = new Set<number>();
  let nextKey = 0;
  for (const key of entries.keys()) nextKey = Math.max(nextKey, key + 1);
  const allocationHint = resolve(root.get(PDFName.of('ParentTreeNextKey')));
  if (allocationHint instanceof PDFNumber && Number.isSafeInteger(allocationHint.asNumber())) nextKey = Math.max(nextKey, allocationHint.asNumber());
  for (let i = 0; i < pages.length; i += 1) {
    const value = resolve(pages[i].node.get(PDFName.of('StructParents')));
    if (value === undefined) continue;
    if (!(value instanceof PDFNumber) || !Number.isSafeInteger(value.asNumber()) || value.asNumber() < 0 || usedPageKeys.has(value.asNumber())) {
      throw new OcrStructureError();
    }
    usedPageKeys.add(value.asNumber());
    pageKeys.set(i + 1, value.asNumber());
    nextKey = Math.max(nextKey, value.asNumber() + 1);
  }

  const arrays = new Map<number, PDFArray>();
  const nextMcids = new Map<number, number>();
  for (const pageNumber of new Set(pageNumbers)) {
    const page = pages[pageNumber - 1];
    if (!page) throw new OcrStructureError();
    let key = pageKeys.get(pageNumber);
    const previous = key === undefined ? undefined : resolve(entries.get(key));
    if (key !== undefined && !(previous instanceof PDFArray)) throw new OcrStructureError();
    if (key === undefined) { key = nextKey++; pageKeys.set(pageNumber, key); }
    const array = PDFArray.withContext(ctx);
    if (previous instanceof PDFArray) previous.asArray().forEach((entry) => array.push(entry));
    const content = decodePageContent(pdf, page);
    if (content === undefined && page.node.has(PDFName.of('Contents'))) throw new OcrStructureError();
    const nextMcid = Math.max(array.size(), maxMcidInContent(content ?? '') + 1);
    if (nextMcid > MAX_MCID) throw new OcrStructureError();
    arrays.set(pageNumber, array);
    nextMcids.set(pageNumber, nextMcid);
  }

  return {
    nextMcids,
    append(bindings: TextBinding[]) {
      for (const binding of bindings) {
        if (binding.mcid > MAX_MCID) throw new OcrStructureError();
        const page = pages[binding.page - 1];
        const array = arrays.get(binding.page)!;
        const element = ctx.obj({ Type: 'StructElem', S: binding.role, P: parentRef, Pg: page.ref, K: binding.mcid });
        const ref = ctx.register(element);
        while (array.size() <= binding.mcid) array.push(PDFNull);
        if (array.get(binding.mcid) !== PDFNull) throw new OcrStructureError();
        array.set(binding.mcid, ref);
        children.push(ref);
      }
      parent.set(PDFName.of('K'), children);
      if (!documentRef) {
        const kids = PDFArray.withContext(ctx);
        candidates.forEach((kid) => kids.push(kid));
        kids.push(parentRef);
        root.set(PDFName.of('K'), candidates.length === 0 ? parentRef : kids);
      }
      // Flatten the number tree while retaining every original page/annotation value.
      // This also handles /Kids trees without changing their structure-element refs.
      for (const [pageNumber, array] of arrays) {
        const key = pageKeys.get(pageNumber)!;
        entries.set(key, ctx.register(array));
        pages[pageNumber - 1].node.set(PDFName.of('StructParents'), PDFNumber.of(key));
        pages[pageNumber - 1].node.set(PDFName.of('Tabs'), PDFName.of('S'));
      }
      const nums = PDFArray.withContext(ctx);
      for (const [key, value] of [...entries].sort(([a], [b]) => a - b)) { nums.push(PDFNumber.of(key)); nums.push(value); }
      root.set(PDFName.of('ParentTree'), ctx.register(ctx.obj({ Nums: nums })));
      root.set(PDFName.of('ParentTreeNextKey'), PDFNumber.of(nextKey));
      pdf.catalog.set(PDFName.of('StructTreeRoot'), rootRef);
      const markValue = pdf.catalog.get(PDFName.of('MarkInfo'));
      const markInfo = markValue ? dict(markValue) : ctx.obj({});
      markInfo.set(PDFName.of('Marked'), PDFBool.True);
      if (!markValue) pdf.catalog.set(PDFName.of('MarkInfo'), ctx.register(markInfo));
    }
  };
}
