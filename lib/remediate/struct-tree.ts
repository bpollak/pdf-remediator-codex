import { PDFDocument, PDFName, PDFArray, PDFDict, PDFNumber } from 'pdf-lib';
import type { TagNode } from './tagger';

/**
 * Injects a real StructTreeRoot, MarkInfo, RoleMap, and per-page Tabs
 * into a PDFDocument using pdf-lib's low-level API.
 */
export function injectStructTree(pdf: PDFDocument, tagTree: TagNode): void {
  const context = pdf.context;
  const pages = pdf.getPages();

  // 1. Set MarkInfo << /Marked true >> on the catalog
  const markInfoDict = context.obj({ Marked: true });
  const markInfoRef = context.register(markInfoDict);
  pdf.catalog.set(PDFName.of('MarkInfo'), markInfoRef);

  // 2. Create StructTreeRoot (allocate ref first so children can reference it as parent)
  const structTreeRootDict = context.obj({ Type: 'StructTreeRoot' });
  const structTreeRootRef = context.register(structTreeRootDict);

  // 3. Build RoleMap
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
    L: 'L',
    LI: 'LI',
    Lbl: 'Lbl',
    LBody: 'LBody',
    Table: 'Table',
    TR: 'TR',
    TH: 'TH',
    TD: 'TD',
    Figure: 'Figure',
    Link: 'Link',
    Form: 'Form',
    Span: 'Span',
  });
  structTreeRootDict.set(PDFName.of('RoleMap'), roleMapDict);

  // 4. Recursively create StructElem dictionaries
  const pageRefs = pages.map((p) => p.ref);

  function resolvePageRef(pageNum?: number) {
    if (pageNum === undefined || pageNum < 1) return undefined;
    return pageRefs[pageNum - 1]; // pages are 1-indexed in TagNode
  }

  function createStructElem(node: TagNode, parentRef: typeof structTreeRootRef): typeof structTreeRootRef {
    const elemDict = context.obj({
      Type: 'StructElem',
      S: node.type,
    });

    elemDict.set(PDFName.of('P'), parentRef);

    const pgRef = resolvePageRef(node.page);
    if (pgRef) {
      elemDict.set(PDFName.of('Pg'), pgRef);
    }

    const elemRef = context.register(elemDict);

    if (node.children && node.children.length > 0) {
      const childRefs = node.children.map((child) => createStructElem(child, elemRef));
      const kArray = PDFArray.withContext(context);
      for (const ref of childRefs) {
        kArray.push(ref);
      }
      elemDict.set(PDFName.of('K'), kArray);
    }

    return elemRef;
  }

  const documentRef = createStructElem(tagTree, structTreeRootRef);
  structTreeRootDict.set(PDFName.of('K'), documentRef);

  // 5. Set StructTreeRoot on catalog
  pdf.catalog.set(PDFName.of('StructTreeRoot'), structTreeRootRef);

  // 6. Set /Tabs /S on each page (structure-based tab order)
  for (const page of pages) {
    page.node.set(PDFName.of('Tabs'), PDFName.of('S'));
  }
}
