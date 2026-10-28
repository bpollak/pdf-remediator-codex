import { describe, expect, it } from 'vitest';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
  decodePDFRawStream
} from 'pdf-lib';
import { applyManualAltText } from '@/lib/remediate/apply-alt-text';
import { parsePdfBytes } from '@/lib/pdf/parser';

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function makePdf(content: Uint8Array, options: { tagged?: boolean; staleNextKey?: boolean } = {}) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  const ctx = doc.context;
  const img = ctx.stream(new Uint8Array([0, 0, 0]), {
    Type: 'XObject',
    Subtype: 'Image',
    Width: 1,
    Height: 1,
    ColorSpace: 'DeviceRGB',
    BitsPerComponent: 8
  });
  page.node.set(PDFName.of('Resources'), ctx.obj({ XObject: { Im0: ctx.register(img) } }));
  page.node.set(PDFName.of('Contents'), ctx.register(ctx.stream(content)));

  if (options.tagged) {
    const root = ctx.obj({ Type: 'StructTreeRoot' });
    const rootRef = ctx.register(root);
    const documentElem = ctx.obj({ Type: 'StructElem', S: 'Document' });
    documentElem.set(PDFName.of('P'), rootRef);
    const documentRef = ctx.register(documentElem);
    const figure = ctx.obj({ Type: 'StructElem', S: 'Figure' });
    figure.set(PDFName.of('P'), documentRef);
    figure.set(PDFName.of('Pg'), page.ref);
    figure.set(PDFName.of('K'), PDFNumber.of(0));
    const figureRef = ctx.register(figure);
    documentElem.set(PDFName.of('K'), ctx.obj([figureRef]));
    root.set(PDFName.of('K'), documentRef);
    root.set(PDFName.of('ParentTree'), ctx.register(ctx.obj({ Nums: [0, ctx.register(ctx.obj([figureRef]))] })));
    // A stale ParentTreeNextKey (0 while key 0 is in use) must not be trusted.
    root.set(PDFName.of('ParentTreeNextKey'), PDFNumber.of(options.staleNextKey ? 0 : 1));
    page.node.set(PDFName.of('StructParents'), PDFNumber.of(0));
    doc.catalog.set(PDFName.of('StructTreeRoot'), rootRef);
  }

  return doc.save();
}

async function firstPageContent(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  const stream = doc.context.lookup(doc.getPages()[0]!.node.get(PDFName.of('Contents'))) as PDFRawStream;
  return decodePDFRawStream(stream).decode();
}

function figureElements(doc: PDFDocument): PDFDict[] {
  const figures: PDFDict[] = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (object instanceof PDFDict && object.get(PDFName.of('S'))?.toString() === '/Figure') figures.push(object);
  }
  return figures;
}

describe('applyManualAltText byte and text fidelity', () => {
  it('keeps content-stream bytes 0x80-0x9F intact when rewriting a page', async () => {
    const encoder = new TextEncoder();
    const head = encoder.encode('BT /F1 12 Tf (');
    const tail = encoder.encode(') Tj ET q 100 0 0 100 0 0 cm /Im0 Do Q');
    const highBytes = [0x80, 0x93, 0x94, 0x9f, 0xa0, 0xff];
    const source = await makePdf(new Uint8Array([...head, ...highBytes, ...tail]));

    const outcome = await applyManualAltText(source, [{ imageId: 'img-1-1', alt: 'A chart', decorative: false }], { 1: 1 });
    expect(outcome.applied).toEqual(['img-1-1']);

    const content = await firstPageContent(outcome.bytes);
    const open = content.indexOf(0x28);
    expect([...content.slice(open + 1, open + 1 + highBytes.length)]).toEqual(highBytes);
    expect(new TextDecoder('latin1').decode(content)).toContain('/Figure <</MCID 0>> BDC');
  });

  it('writes non-Latin-1 alt text losslessly', async () => {
    const source = await makePdf(new TextEncoder().encode('q 100 0 0 100 0 0 cm /Im0 Do Q'));
    const alt = 'Chart 2020–2024 (it’s up 5% → 7%) 日本語';
    const outcome = await applyManualAltText(source, [{ imageId: 'img-1-1', alt, decorative: false }], { 1: 1 });

    const doc = await PDFDocument.load(outcome.bytes);
    const figures = figureElements(doc);
    expect(figures).toHaveLength(1);
    const stored = figures[0]!.get(PDFName.of('Alt'));
    expect(stored instanceof PDFHexString || stored instanceof PDFString).toBe(true);
    expect((stored as PDFHexString).decodeText()).toBe(alt);

    const reparsed = await parsePdfBytes(toArrayBuffer(outcome.bytes));
    expect(reparsed.images[0]?.alt).toBe(alt);
  });

  it('sets /Alt on an existing Figure instead of wrapping the image in a second Figure', async () => {
    const source = await makePdf(
      new TextEncoder().encode('/Figure <</MCID 0>> BDC q 100 0 0 100 0 0 cm /Im0 Do Q EMC'),
      { tagged: true }
    );
    const parsed = await parsePdfBytes(toArrayBuffer(source));
    expect(parsed.images[0]?.markedContentId).toBe(0);

    const outcome = await applyManualAltText(source, [{ imageId: 'img-1-1', alt: 'A bar chart', decorative: false }], { 1: 1 });
    expect(outcome.applied).toEqual(['img-1-1']);
    expect(outcome.skipped).toEqual([]);

    const content = new TextDecoder('latin1').decode(await firstPageContent(outcome.bytes));
    expect(content.match(/BDC/g)).toHaveLength(1);

    const doc = await PDFDocument.load(outcome.bytes);
    const figures = figureElements(doc);
    expect(figures).toHaveLength(1);
    expect((figures[0]!.get(PDFName.of('Alt')) as PDFString).decodeText()).toBe('A bar chart');

    const reparsed = await parsePdfBytes(toArrayBuffer(outcome.bytes));
    expect(reparsed.images[0]?.alt).toBe('A bar chart');
  });

  it('updates alt text in place when the same image is described twice', async () => {
    const source = await makePdf(new TextEncoder().encode('q 100 0 0 100 0 0 cm /Im0 Do Q'));
    const first = await applyManualAltText(source, [{ imageId: 'img-1-1', alt: 'First draft', decorative: false }], { 1: 1 });
    const second = await applyManualAltText(first.bytes, [{ imageId: 'img-1-1', alt: 'Final text', decorative: false }], { 1: 1 });
    expect(second.skipped).toEqual([]);

    const doc = await PDFDocument.load(second.bytes);
    const figures = figureElements(doc);
    expect(figures).toHaveLength(1);
    expect((figures[0]!.get(PDFName.of('Alt')) as PDFString).decodeText()).toBe('Final text');
  });

  it('never reuses an occupied ParentTree key when ParentTreeNextKey is stale', async () => {
    // Page content has an untagged second image on a new page to force a new key.
    const doc = await PDFDocument.load(
      await makePdf(new TextEncoder().encode('/Figure <</MCID 0>> BDC q 100 0 0 100 0 0 cm /Im0 Do Q EMC'), {
        tagged: true,
        staleNextKey: true
      })
    );
    const firstPage = doc.getPages()[0]!;
    const secondPage = doc.addPage([200, 200]);
    secondPage.node.set(PDFName.of('Resources'), firstPage.node.get(PDFName.of('Resources'))!);
    secondPage.node.set(
      PDFName.of('Contents'),
      doc.context.register(doc.context.stream(new TextEncoder().encode('q 100 0 0 100 0 0 cm /Im0 Do Q')))
    );
    const source = await doc.save();

    const outcome = await applyManualAltText(source, [{ imageId: 'img-2-1', alt: 'Second page image', decorative: false }], {
      2: 1
    });
    expect(outcome.applied).toEqual(['img-2-1']);

    const out = await PDFDocument.load(outcome.bytes);
    const keys = out.getPages().map((page) => (page.node.get(PDFName.of('StructParents')) as PDFNumber).asNumber());
    expect(new Set(keys).size).toBe(2);

    const root = out.context.lookup(out.catalog.get(PDFName.of('StructTreeRoot'))) as PDFDict;
    const nextKey = (root.get(PDFName.of('ParentTreeNextKey')) as PDFNumber).asNumber();
    expect(nextKey).toBeGreaterThan(Math.max(...keys));
    const parentTree = out.context.lookup(root.get(PDFName.of('ParentTree'))) as PDFDict;
    const nums = out.context.lookup(parentTree.get(PDFName.of('Nums'))) as PDFArray;
    const numKeys: number[] = [];
    for (let i = 0; i < nums.size(); i += 2) numKeys.push((nums.get(i) as PDFNumber).asNumber());
    expect(new Set(numKeys).size).toBe(numKeys.length);
  });
});
