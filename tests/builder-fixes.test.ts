import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
  StandardFonts,
  decodePDFRawStream
} from 'pdf-lib';
import { buildRemediatedPdf } from '@/lib/remediate/builder';
import { applyManualAltText } from '@/lib/remediate/apply-alt-text';
import { parsePdfBytes } from '@/lib/pdf/parser';
import { runAudit } from '@/lib/audit/engine';
import type { ParsedPDF } from '@/lib/pdf/types';

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function emptyParsed(overrides: Partial<ParsedPDF> = {}): ParsedPDF {
  return {
    pageCount: 1,
    metadata: {},
    hasStructTree: false,
    tags: [],
    textItems: [],
    images: [],
    links: [],
    outlines: [],
    forms: [],
    ...overrides
  };
}

function structKids(doc: PDFDocument): PDFDict[] {
  const root = doc.context.lookup(doc.catalog.get(PDFName.of('StructTreeRoot'))) as PDFDict;
  const documentElem = doc.context.lookup(root.get(PDFName.of('K'))) as PDFDict;
  const kids = doc.context.lookup(documentElem.get(PDFName.of('K'))) as PDFArray;
  const result: PDFDict[] = [];
  for (let i = 0; i < kids.size(); i += 1) result.push(doc.context.lookup(kids.get(i)) as PDFDict);
  return result;
}

/** RC4 + MD5 owner-password-only (R2, 40-bit) PDF, as produced by "restrict editing" tools. */
function createOwnerPasswordPdf(): Uint8Array {
  const pad = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex');
  const rc4 = (key: Buffer, data: Buffer) => {
    const S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    for (let i = 0; i < 256; i += 1) {
      j = (j + S[i]! + key[i % key.length]!) % 256;
      [S[i], S[j]] = [S[j]!, S[i]!];
    }
    const out = Buffer.alloc(data.length);
    let i = 0;
    j = 0;
    for (let n = 0; n < data.length; n += 1) {
      i = (i + 1) % 256;
      j = (j + S[i]!) % 256;
      [S[i], S[j]] = [S[j]!, S[i]!];
      out[n] = data[n]! ^ S[(S[i]! + S[j]!) % 256]!;
    }
    return out;
  };
  const md5 = (...parts: Buffer[]) => createHash('md5').update(Buffer.concat(parts)).digest();

  const O = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
  const P = Buffer.alloc(4);
  P.writeInt32LE(-44);
  const id = Buffer.from('0123456789abcdef');
  const key = md5(pad, O, P, id).subarray(0, 5);
  const U = rc4(key, pad);
  const objectKey = (num: number) => {
    const suffix = Buffer.from([num & 0xff, (num >> 8) & 0xff, (num >> 16) & 0xff, 0, 0]);
    return md5(key, suffix).subarray(0, 10);
  };

  const content = rc4(
    objectKey(4),
    Buffer.from('BT /F1 18 Tf 72 700 Td (Hello encrypted world heading) Tj ET BT /F1 11 Tf 72 670 Td (Body text line) Tj ET')
  );
  const title = rc4(objectKey(6), Buffer.from('Secret Title'));
  const objects: Record<number, Buffer> = {
    1: Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    2: Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    3: Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>'),
    4: Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from('\nendstream')]),
    5: Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
    6: Buffer.from(`<< /Title <${title.toString('hex')}> >>`),
    7: Buffer.from(`<< /Filter /Standard /V 1 /R 2 /O <${O.toString('hex')}> /U <${U.toString('hex')}> /P -44 >>`)
  };

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  let length = chunks[0]!.length;
  const offsets: number[] = [];
  for (let num = 1; num <= 7; num += 1) {
    offsets[num] = length;
    const chunk = Buffer.concat([Buffer.from(`${num} 0 obj\n`), objects[num]!, Buffer.from('\nendobj\n')]);
    chunks.push(chunk);
    length += chunk.length;
  }
  let xref = `xref\n0 8\n0000000000 65535 f \n`;
  for (let num = 1; num <= 7; num += 1) xref += `${String(offsets[num]).padStart(10, '0')} 00000 n \n`;
  const idHex = id.toString('hex');
  chunks.push(
    Buffer.from(
      `${xref}trailer\n<< /Size 8 /Root 1 0 R /Info 6 0 R /Encrypt 7 0 R /ID [<${idHex}> <${idHex}>] >>\nstartxref\n${length}\n%%EOF\n`
    )
  );
  return new Uint8Array(Buffer.concat(chunks));
}

describe('buildRemediatedPdf fixes', () => {
  it('refuses permissions-restricted (encrypted) PDFs with a clear error', async () => {
    const source = createOwnerPasswordPdf();
    const parsed = await parsePdfBytes(toArrayBuffer(source));
    expect(parsed.textItems.length).toBeGreaterThan(0);

    await expect(buildRemediatedPdf(parsed, 'en-US', toArrayBuffer(source))).rejects.toThrow(/encrypted/i);
    await expect(buildRemediatedPdf(parsed, 'en-US', toArrayBuffer(source))).rejects.toThrow(/without security|No Security/i);
    await expect(applyManualAltText(source, [], {})).rejects.toThrow(/encrypted/i);
  });

  it('emits headings and paragraphs interleaved in reading order, without repeating heading text', async () => {
    const doc = await PDFDocument.create();
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    for (let pageIndex = 0; pageIndex < 2; pageIndex += 1) {
      const page = doc.addPage([612, 792]);
      page.drawText(`Section ${pageIndex + 1} Title`, { x: 72, y: 720, size: 20, font: bold });
      page.drawText(`Body paragraph one on page ${pageIndex + 1} with enough words.`, { x: 72, y: 690, size: 11, font: regular });
      page.drawText(`Sub heading ${pageIndex + 1}`, { x: 72, y: 650, size: 15, font: bold });
      page.drawText(`Body paragraph two on page ${pageIndex + 1} with enough words.`, { x: 72, y: 620, size: 11, font: regular });
      for (let line = 0; line < 4; line += 1) {
        page.drawText(`Filler line ${line} on page ${pageIndex + 1} text text`, { x: 72, y: 560 - line * 40, size: 11, font: regular });
      }
    }
    const source = await doc.save();
    const parsed = await parsePdfBytes(toArrayBuffer(source));
    // The invisible tagged copy is opt-in (off by default).
    const output = await buildRemediatedPdf(parsed, 'en-US', toArrayBuffer(source), { injectBoundTextLayer: true });

    const result = await PDFDocument.load(output);
    const pageRefs = result.getPages().map((page) => page.ref.toString());
    const sequence = structKids(result).map(
      (elem) => `${elem.get(PDFName.of('S'))}@${pageRefs.indexOf(elem.get(PDFName.of('Pg'))!.toString()) + 1}`
    );
    expect(sequence.slice(0, 4)).toEqual(['/H1@1', '/P@1', '/H2@1', '/P@1']);
    const firstPageTwo = sequence.indexOf('/H1@2');
    expect(firstPageTwo).toBeGreaterThan(0);
    expect(sequence.slice(0, firstPageTwo).every((entry) => entry.endsWith('@1'))).toBe(true);
    expect(sequence.slice(firstPageTwo, firstPageTwo + 4)).toEqual(['/H1@2', '/P@2', '/H2@2', '/P@2']);
    expect(sequence.filter((entry) => /^\/H/.test(entry))).toHaveLength(4);

    // Each heading line appears once in the invisible tagged layer.
    const reparsed = await parsePdfBytes(toArrayBuffer(output));
    const titleCopies = reparsed.textItems.filter((item) => item.text.includes('Section 1 Title'));
    expect(titleCopies).toHaveLength(2); // original visible text + one tagged copy
    expect(result.catalog.get(PDFName.of('StructTreeRoot'))).toBeDefined();
    const root = result.context.lookup(result.catalog.get(PDFName.of('StructTreeRoot'))) as PDFDict;
    expect(root.get(PDFName.of('RoleMap'))).toBeUndefined();
  });

  it('starts new MCIDs above the ones already used in page content', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    page.drawText('Existing tagged paragraph text', { x: 72, y: 700, size: 12, font });
    const existing = doc.context.stream(new TextEncoder().encode('/P <</MCID 0>> BDC /Span <</MCID 4>> BDC EMC EMC'));
    const contents = doc.context.lookup(page.node.get(PDFName.of('Contents')));
    const contentArray = contents instanceof PDFArray ? contents : doc.context.obj([page.node.get(PDFName.of('Contents'))!]);
    contentArray.push(doc.context.register(existing));
    page.node.set(PDFName.of('Contents'), contentArray);
    const source = await doc.save();

    const parsed = await parsePdfBytes(toArrayBuffer(source));
    const output = await buildRemediatedPdf(parsed, 'en-US', toArrayBuffer(source), { injectBoundTextLayer: true });
    const result = await PDFDocument.load(output);

    const mcids = structKids(result).map((elem) => (elem.get(PDFName.of('K')) as PDFNumber).asNumber());
    expect(mcids.length).toBeGreaterThan(0);
    expect(Math.min(...mcids)).toBeGreaterThanOrEqual(5);
  });

  it('writes non-Latin-1 outline titles losslessly', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    doc.addPage([612, 792]);
    const source = await doc.save();
    const title = 'Résumé — 概要 (Überblick)';
    const parsed = emptyParsed({
      pageCount: 2,
      textItems: [
        { text: title, x: 72, y: 700, width: 200, height: 18, fontName: 'Helvetica-Bold', fontSize: 18, bold: true, page: 1 },
        { text: 'Body text body text body text', x: 72, y: 660, width: 200, height: 11, fontName: 'Helvetica', fontSize: 11, page: 1 },
        { text: 'Body text again and again here', x: 72, y: 646, width: 200, height: 11, fontName: 'Helvetica', fontSize: 11, page: 2 }
      ]
    });

    const output = await buildRemediatedPdf(parsed, 'en-US', source);
    const reparsed = await parsePdfBytes(toArrayBuffer(output));
    expect(reparsed.outlines.map((outline) => outline.title)).toContain(title);
  });

  it('labels hierarchical form fields by their fully qualified name, with Unicode tooltips', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    page.drawText('Street address', { x: 72, y: 700, size: 11, font });
    doc.getForm().createTextField('person.street').addToPage(page, { x: 200, y: 695, width: 200, height: 20 });
    doc.getForm().createTextField('person.city').addToPage(page, { x: 200, y: 600, width: 200, height: 20 });
    const source = await doc.save();

    const parsed = await parsePdfBytes(toArrayBuffer(source));
    expect(parsed.forms.map((form) => form.name)).toEqual(expect.arrayContaining(['person.street', 'person.city']));
    // A label with characters outside Latin-1.
    parsed.textItems.push({ text: 'Город (city)', x: 72, y: 605, width: 100, height: 11, fontName: 'Helvetica', fontSize: 11, page: 1 });

    const output = await buildRemediatedPdf(parsed, 'en-US', toArrayBuffer(source));
    const reparsed = await parsePdfBytes(toArrayBuffer(output));
    expect(reparsed.forms).toContainEqual(expect.objectContaining({ name: 'person.street', label: 'Street address' }));
    expect(reparsed.forms).toContainEqual(expect.objectContaining({ name: 'person.city', label: 'Город (city)' }));

    // The non-terminal "person" field must not receive a tooltip.
    const result = await PDFDocument.load(output);
    const acroForm = result.context.lookup(result.catalog.get(PDFName.of('AcroForm'))) as PDFDict;
    const fields = result.context.lookup(acroForm.get(PDFName.of('Fields'))) as PDFArray;
    const person = result.context.lookup(fields.get(0)) as PDFDict;
    expect((person.get(PDFName.of('T')) as PDFString).decodeText()).toBe('person');
    expect(person.get(PDFName.of('TU'))).toBeUndefined();
  });

  it('writes an XMP packet with pdfuaid:part and dc:title that the parser reads back', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    const source = await doc.save();
    const parsed = emptyParsed({
      title: 'Annual <Report> & Plan',
      structureBinding: {
        structElemCount: 1,
        structElemWithPageRef: 1,
        structElemWithMcid: 1,
        structElemWithNumericK: 1,
        structElemWithMcr: 0,
        hasParentTree: true,
        hasParentTreeEntries: true,
        tableStructCount: 0,
        rowStructCount: 0,
        headerCellStructCount: 0,
        dataCellStructCount: 0,
        hasContentBinding: true
      }
    });

    const output = await buildRemediatedPdf(parsed, 'en-US', source);
    const result = await PDFDocument.load(output);
    const metadataStream = result.context.lookup(result.catalog.get(PDFName.of('Metadata'))) as PDFRawStream;
    expect(metadataStream.dict.get(PDFName.of('Subtype'))?.toString()).toBe('/XML');
    const xmp = new TextDecoder().decode(decodePDFRawStream(metadataStream).decode());
    expect(xmp).toContain('<pdfuaid:part>1</pdfuaid:part>');
    expect(xmp).toContain('Annual &lt;Report&gt; &amp; Plan');

    // Drop the Keywords manifest so only XMP can supply the identifier.
    result.setKeywords([]);
    const withoutManifest = await result.save();
    const reparsed = await parsePdfBytes(toArrayBuffer(withoutManifest));
    expect(reparsed.metadata['pdfuaid:part']).toBe('1');
    expect(runAudit(reparsed).findings.some((finding) => finding.ruleId === 'DOC-001')).toBe(false);
  });

  it('normalizes bound heading levels with a stack so siblings stay siblings', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const context = doc.context;
    const root = context.obj({ Type: 'StructTreeRoot' });
    const rootRef = context.register(root);
    const documentElem = context.obj({ Type: 'StructElem', S: 'Document' });
    documentElem.set(PDFName.of('P'), rootRef);
    const documentRef = context.register(documentElem);
    const kids = context.obj([]);
    ['H1', 'H3', 'H3', 'H3'].forEach((role, mcid) => {
      const elem = context.obj({ Type: 'StructElem', S: role });
      elem.set(PDFName.of('P'), documentRef);
      elem.set(PDFName.of('Pg'), page.ref);
      elem.set(PDFName.of('K'), PDFNumber.of(mcid));
      kids.push(context.register(elem));
    });
    documentElem.set(PDFName.of('K'), kids);
    root.set(PDFName.of('K'), documentRef);
    doc.catalog.set(PDFName.of('StructTreeRoot'), rootRef);
    const source = await doc.save();

    const parsed = emptyParsed({
      hasStructTree: true,
      structureBinding: {
        structElemCount: 5,
        structElemWithPageRef: 4,
        structElemWithMcid: 0,
        structElemWithNumericK: 4,
        structElemWithMcr: 0,
        hasParentTree: false,
        hasParentTreeEntries: false,
        tableStructCount: 0,
        rowStructCount: 0,
        headerCellStructCount: 0,
        dataCellStructCount: 0,
        hasContentBinding: true
      }
    });
    const output = await buildRemediatedPdf(parsed, 'en-US', source);
    const result = await PDFDocument.load(output);
    expect(structKids(result).map((elem) => elem.get(PDFName.of('S'))?.toString())).toEqual(['/H1', '/H2', '/H2', '/H2']);
  });
});
