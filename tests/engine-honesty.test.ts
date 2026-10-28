import { describe, expect, it } from 'vitest';
import {
  PDFArray,
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
  StandardFonts,
  decodePDFRawStream,
  degrees
} from 'pdf-lib';
import { buildRemediatedPdf } from '@/lib/remediate/builder';
import { applyManualAltText } from '@/lib/remediate/apply-alt-text';
import { decodeManifest } from '@/lib/remediate/manifest';
import { parsePdfBytes } from '@/lib/pdf/parser';
import { runAudit } from '@/lib/audit/engine';
import { SIGNED_PDF_MESSAGE } from '@/lib/pdf/encryption';
import type { ParsedPDF } from '@/lib/pdf/types';

function ab(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function untaggedPdf(setup?: (doc: PDFDocument) => void): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText('Quarterly budget report for the department', { x: 72, y: 700, size: 12, font });
  page.drawText('Spending rose in the second quarter of the year.', { x: 72, y: 680, size: 12, font });
  setup?.(doc);
  return doc.save();
}

/** Minimal tagged PDF: Document > P... each bound to one MCID; optional untagged image in the middle. */
async function taggedPdf(opts: { paras: string[]; image?: boolean; lang?: string; title?: string }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([612, 792]);
  const ctx = pdf.context;
  const resources = ctx.obj({}) as PDFDict;
  const fonts = ctx.obj({}) as PDFDict;
  fonts.set(PDFName.of('F1'), font.ref);
  resources.set(PDFName.of('Font'), fonts);
  let content = '';
  let y = 720;
  const half = Math.ceil(opts.paras.length / 2);
  opts.paras.forEach((text, mcid) => {
    content += `/P <</MCID ${mcid}>> BDC BT /F1 11 Tf 72 ${y} Td (${text}) Tj ET EMC\n`;
    y -= 20;
    if (opts.image && mcid === half - 1) {
      const img = ctx.stream(new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0]), {
        Type: 'XObject', Subtype: 'Image', Width: 2, Height: 2, ColorSpace: 'DeviceRGB', BitsPerComponent: 8
      });
      const xobjects = ctx.obj({}) as PDFDict;
      xobjects.set(PDFName.of('Im0'), ctx.register(img));
      resources.set(PDFName.of('XObject'), xobjects);
      content += `q 100 0 0 100 72 ${y - 100} cm /Im0 Do Q\n`;
      y -= 120;
    }
  });
  page.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(content)));
  page.node.set(PDFName.of('Resources'), resources);
  page.node.set(PDFName.of('StructParents'), PDFNumber.of(0));
  const root = ctx.obj({ Type: 'StructTreeRoot' }) as PDFDict;
  const rootRef = ctx.register(root);
  const docEl = ctx.obj({ Type: 'StructElem', S: 'Document' }) as PDFDict;
  docEl.set(PDFName.of('P'), rootRef);
  const docRef = ctx.register(docEl);
  const kids = PDFArray.withContext(ctx);
  const parents = PDFArray.withContext(ctx);
  opts.paras.forEach((_, mcid) => {
    const el = ctx.obj({ Type: 'StructElem', S: 'P' }) as PDFDict;
    el.set(PDFName.of('P'), docRef);
    el.set(PDFName.of('Pg'), page.ref);
    el.set(PDFName.of('K'), PDFNumber.of(mcid));
    const ref = ctx.register(el);
    kids.push(ref);
    parents.push(ref);
  });
  docEl.set(PDFName.of('K'), kids);
  root.set(PDFName.of('K'), docRef);
  const nums = PDFArray.withContext(ctx);
  nums.push(PDFNumber.of(0));
  nums.push(ctx.register(parents));
  root.set(PDFName.of('ParentTree'), ctx.register(ctx.obj({ Nums: nums })));
  root.set(PDFName.of('ParentTreeNextKey'), PDFNumber.of(1));
  pdf.catalog.set(PDFName.of('StructTreeRoot'), rootRef);
  pdf.catalog.set(PDFName.of('MarkInfo'), ctx.obj({ Marked: true }));
  if (opts.lang) pdf.catalog.set(PDFName.of('Lang'), PDFString.of(opts.lang));
  if (opts.title) pdf.setTitle(opts.title);
  return pdf.save();
}

async function remediate(bytes: Uint8Array, options: Parameters<typeof buildRemediatedPdf>[3] = {}, parsedOverride?: ParsedPDF) {
  const parsed = parsedOverride ?? (await parsePdfBytes(ab(bytes)));
  const out = await buildRemediatedPdf(parsed, parsed.language ?? 'en-US', ab(bytes), options);
  const reparsed = await parsePdfBytes(ab(out));
  return { parsed, out, reparsed, audit: runAudit(reparsed) };
}

function xmpOf(doc: PDFDocument): string {
  const stream = doc.context.lookup(doc.catalog.get(PDFName.of('Metadata'))) as PDFRawStream;
  return new TextDecoder().decode(decodePDFRawStream(stream).decode());
}

function pageContent(doc: PDFDocument, pageIndex = 0): string {
  const contents = doc.getPages()[pageIndex]!.node.get(PDFName.of('Contents'));
  const resolved = doc.context.lookup(contents);
  const refs = resolved instanceof PDFArray ? resolved.asArray() : [contents];
  return refs
    .map((ref) => Buffer.from(decodePDFRawStream(doc.context.lookup(ref) as PDFRawStream).decode()).toString('latin1'))
    .join('\n');
}

describe('remediation metadata is never invented', () => {
  it('leaves missing title, author and subject missing, adds no marketing keywords, and keeps Creator', async () => {
    const source = await untaggedPdf((doc) => doc.setCreator('Microsoft Word'));
    const { out, reparsed, audit } = await remediate(source);
    const result = await PDFDocument.load(out, { updateMetadata: false });

    expect(result.getTitle()).toBeUndefined();
    expect(result.getAuthor()).toBeUndefined();
    expect(result.getSubject()).toBeUndefined();
    expect(result.getCreator()).toBe('Microsoft Word');
    expect(result.getProducer()).toBe('PDF Remediator');
    const keywords = (result.getKeywords() ?? '').split(/\s+/);
    expect(keywords).not.toContain('accessible');
    expect(keywords).not.toContain('wcag');
    expect(keywords).not.toContain('remediated');

    const xmp = xmpOf(result);
    expect(xmp).not.toContain('<dc:title>');
    expect(xmp).not.toContain('Accessible remediated PDF');
    expect(xmp).not.toContain('Accessibility remediated document');
    expect(xmp).toContain('<xmp:CreatorTool>Microsoft Word</xmp:CreatorTool>');

    expect(reparsed.title).toBeUndefined();
    expect(audit.findings.some((finding) => finding.ruleId === 'META-003')).toBe(true);
  });

  it('keeps existing title, author and subject', async () => {
    const source = await untaggedPdf((doc) => {
      doc.setTitle('Budget 2026');
      doc.setAuthor('Finance Office');
      doc.setSubject('Quarterly figures');
    });
    const { out } = await remediate(source);
    const result = await PDFDocument.load(out, { updateMetadata: false });
    expect(result.getTitle()).toBe('Budget 2026');
    expect(result.getAuthor()).toBe('Finance Office');
    expect(result.getSubject()).toBe('Quarterly figures');
  });

  it('records an assumed language in the manifest, exposes it after re-parse, and keeps it across passes', async () => {
    const source = await untaggedPdf();
    const first = await remediate(source);
    const result = await PDFDocument.load(first.out, { updateMetadata: false });

    expect(result.catalog.get(PDFName.of('Lang'))?.toString()).toBe('(en-US)');
    expect(decodeManifest(result.getKeywords())?.languageAssumed).toBe(true);
    expect(first.reparsed.language).toBe('en-US');
    expect(first.reparsed.languageAssumed).toBe(true);
    expect(first.audit.findings.some((finding) => finding.ruleId === 'DOC-003')).toBe(false);
    const doc006 = first.audit.findings.find((finding) => finding.ruleId === 'DOC-006');
    expect(doc006?.severity).toBe('major');
    expect(doc006?.wcagCriterion).toMatch(/^3\.1\.1/);

    const second = await remediate(first.out, { strictPdfUa: true }, first.reparsed);
    expect(second.reparsed.languageAssumed).toBe(true);
    expect(second.audit.findings.some((finding) => finding.ruleId === 'DOC-006')).toBe(true);
  });

  it('treats the OCR default language as assumed when the source had no /Lang', async () => {
    const source = await untaggedPdf();
    const parsed = await parsePdfBytes(ab(source));
    // OCR results copy the source parse but fill `language` with a default.
    const ocrParsed: ParsedPDF = { ...parsed, language: 'en-US' };
    const { reparsed } = await remediate(source, { addInvisibleTextLayer: true }, ocrParsed);
    expect(reparsed.languageAssumed).toBe(true);
  });

  it('does not mark a language from the source as assumed', async () => {
    const source = await untaggedPdf((doc) => doc.setLanguage('es-ES'));
    const { out, reparsed, audit } = await remediate(source);
    const result = await PDFDocument.load(out, { updateMetadata: false });
    expect(result.catalog.get(PDFName.of('Lang'))?.toString()).toBe('(es-ES)');
    expect(reparsed.language).toBe('es-ES');
    expect(reparsed.languageAssumed).toBeUndefined();
    expect(audit.findings.some((finding) => finding.ruleId === 'DOC-006')).toBe(false);
  });

  it('prefers the catalog /Lang over a stale manifest and drops the assumption once a person sets it', async () => {
    const { out } = await remediate(await untaggedPdf());
    const edited = await PDFDocument.load(out, { updateMetadata: false });
    edited.setLanguage('fr-FR');
    const reparsed = await parsePdfBytes(ab(await edited.save()));
    expect(reparsed.language).toBe('fr-FR');
    expect(reparsed.languageAssumed).toBeUndefined();
  });
});

describe('PDF/UA is only claimed when earned', () => {
  it('does not claim PDF/UA for an untagged file, on the first or second pass', async () => {
    const first = await remediate(await untaggedPdf());
    expect(first.reparsed.metadata['pdfuaid:part']).toBeUndefined();
    expect(xmpOf(await PDFDocument.load(first.out))).not.toContain('pdfuaid:part>');

    const second = await remediate(first.out, { strictPdfUa: true }, first.reparsed);
    expect(second.reparsed.metadata['pdfuaid:part']).toBeUndefined();
    expect(second.reparsed.remediationMode).toBe('analysis-only');
  });

  it('does not claim PDF/UA on pass 2 because of structure this tool injected', async () => {
    for (const options of [{ addInvisibleTextLayer: true }, { injectBoundTextLayer: true }]) {
      const source = await untaggedPdf();
      const parsed = await parsePdfBytes(ab(source));
      const withOcr: ParsedPDF = {
        ...parsed,
        textItems: [
          ...parsed.textItems,
          { text: 'Scanned memo text line', x: 72, y: 600, width: 200, height: 12, fontName: 'OCR', fontSize: 12, page: 1 }
        ]
      };
      const first = await remediate(source, options, withOcr);
      expect(first.reparsed.structureBinding?.hasContentBinding).toBe(true);
      expect(first.reparsed.remediationMode).toBe('analysis-only');
      expect(first.reparsed.metadata['pdfuaid:part']).toBeUndefined();

      const second = await remediate(first.out, { ...options, strictPdfUa: true }, first.reparsed);
      expect(second.reparsed.remediationMode).toBe('analysis-only');
      expect(second.reparsed.metadata['pdfuaid:part']).toBeUndefined();
    }
  });

  it('claims PDF/UA for a source whose own structure is bound to its content', async () => {
    const { reparsed } = await remediate(await taggedPdf({ paras: ['First paragraph.', 'Second paragraph.'], lang: 'en-US', title: 'T' }));
    expect(reparsed.remediationMode).toBe('content-bound');
    expect(reparsed.metadata['pdfuaid:part']).toBe('1');
  });
});

describe('untagged documents are not given an invisible tagged copy', () => {
  it('adds no structure tree to an untagged, non-OCR document and keeps it analysis-only', async () => {
    const source = await untaggedPdf();
    const { parsed, out, reparsed } = await remediate(source);
    const result = await PDFDocument.load(out);
    expect(result.catalog.get(PDFName.of('StructTreeRoot'))).toBeUndefined();
    expect(result.catalog.get(PDFName.of('MarkInfo'))).toBeUndefined();
    expect(reparsed.hasStructTree).toBe(false);
    expect(reparsed.remediationMode).toBe('analysis-only');
    expect(reparsed.textItems.map((item) => item.text)).toEqual(parsed.textItems.map((item) => item.text));
  });

  it('OCR text layer keeps every line in full, including repeated wording and more than 1200 lines', async () => {
    const doc = await PDFDocument.create();
    for (let index = 0; index < 5; index += 1) doc.addPage([612, 792]);
    doc.catalog.set(PDFName.of('MarkInfo'), doc.context.obj({ UserProperties: true }));
    const source = await doc.save();
    const parsed = await parsePdfBytes(ab(source));
    const longLine = Array.from({ length: 80 }, (_, index) => `word${index}`).join(' ');
    const lines: ParsedPDF['textItems'] = [];
    for (let page = 1; page <= 5; page += 1) {
      for (let line = 0; line < 260; line += 1) {
        lines.push({ text: `Status: pending review by the committee chair, item ${page}-${line}`, x: 36, y: 780 - line * 3, width: 300, height: 3, fontName: 'OCR', fontSize: 8, page });
      }
    }
    lines.push({ text: longLine, x: 36, y: 20, width: 500, height: 8, fontName: 'OCR', fontSize: 8, page: 1 });
    const { out, reparsed } = await remediate(source, { addInvisibleTextLayer: true }, { ...parsed, textItems: lines });

    const texts = reparsed.textItems.map((item) => item.text);
    expect(texts.filter((text) => text.startsWith('Status: pending review'))).toHaveLength(1300);
    const result = await PDFDocument.load(out);
    // The long line runs off the page, where pdf.js stops extracting; check
    // the drawn string itself (Helvetica text is written as hex).
    const drawn = [...pageContent(result).matchAll(/<([0-9A-F]+)> Tj/gi)].map((match) =>
      Buffer.from(match[1]!, 'hex').toString('latin1')
    );
    expect(drawn).toContain(longLine);
    const markInfo = result.catalog.lookup(PDFName.of('MarkInfo')) as PDFDict;
    expect(markInfo.get(PDFName.of('Marked'))).toBe(PDFBool.True);
    expect(markInfo.get(PDFName.of('UserProperties'))).toBe(PDFBool.True);
  });

  it('OCR text layer carries characters Helvetica cannot draw in /ActualText and follows page rotation', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]).setRotation(degrees(90));
    const source = await doc.save();
    const parsed = await parsePdfBytes(ab(source));
    const text = 'Ελληνικά and English';
    const { out } = await remediate(source, { addInvisibleTextLayer: true }, {
      ...parsed,
      textItems: [{ text, x: 100, y: 100, width: 200, height: 12, fontName: 'OCR', fontSize: 12, page: 1 }]
    });
    const content = pageContent(await PDFDocument.load(out));
    expect(content).toMatch(/\/ActualText <FEFF[0-9A-F]+>/i);
    expect(content).toMatch(/\b0 1 -1 0 100 100 Tm/);
  });
});

describe('form tooltips are only written for clear labels', () => {
  it('writes no guessed or name-derived tooltip, so FRM-001 keeps failing', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    page.drawText('Applicant information', { x: 72, y: 720, size: 16, font });
    page.drawText('Last name', { x: 72, y: 690, size: 11, font });
    const form = doc.getForm();
    form.createTextField('Text1').addToPage(page, { x: 200, y: 600, width: 150, height: 20 });
    form.createTextField('Check Box2').addToPage(page, { x: 200, y: 560, width: 150, height: 20 });
    // Below "Last name", but not directly under it.
    form.createTextField('fname').addToPage(page, { x: 200, y: 640, width: 150, height: 20 });
    // Same line as "Last name", but far to the right of it.
    form.createTextField('dob').addToPage(page, { x: 400, y: 686, width: 100, height: 20 });
    const { reparsed, audit } = await remediate(await doc.save());

    expect(reparsed.forms.map((field) => field.label)).toEqual([undefined, undefined, undefined, undefined]);
    expect(audit.findings.filter((finding) => finding.ruleId === 'FRM-001')).toHaveLength(4);
  });

  it('uses text directly above a field as its label', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    page.drawText('Email address', { x: 200, y: 668, size: 11, font });
    doc.getForm().createTextField('field7').addToPage(page, { x: 200, y: 640, width: 150, height: 20 });
    const { reparsed } = await remediate(await doc.save());
    expect(reparsed.forms).toContainEqual(expect.objectContaining({ name: 'field7', label: 'Email address' }));
  });
});

describe('files that would be damaged are refused or preserved', () => {
  it('refuses a certified (DocMDP) PDF and a PDF with a filled signature field', async () => {
    const certified = await untaggedPdf((doc) => {
      doc.catalog.set(PDFName.of('Perms'), doc.context.obj({ DocMDP: doc.context.register(doc.context.obj({ Type: 'Sig' })) }));
    });
    const signed = await untaggedPdf((doc) => {
      const sigValue = doc.context.register(doc.context.obj({ Type: 'Sig', Filter: 'Adobe.PPKLite' }));
      const field = doc.context.obj({ FT: 'Sig', T: PDFString.of('Signature1'), V: sigValue });
      doc.catalog.set(PDFName.of('AcroForm'), doc.context.obj({ Fields: [doc.context.register(field)], SigFlags: 3 }));
    });

    for (const source of [certified, signed]) {
      const parsed = await parsePdfBytes(ab(source));
      await expect(buildRemediatedPdf(parsed, 'en-US', ab(source))).rejects.toThrow(SIGNED_PDF_MESSAGE);
      await expect(applyManualAltText(source, [], {})).rejects.toThrow(/digitally signed/);
    }
    expect(SIGNED_PDF_MESSAGE).toBe(
      'This PDF is digitally signed. Changing it would invalidate the signature. Remove the signature or work from the unsigned original.'
    );
  });

  it('accepts a PDF whose signature field has never been signed', async () => {
    const source = await untaggedPdf((doc) => {
      const field = doc.context.obj({ FT: 'Sig', T: PDFString.of('Signature1') });
      doc.catalog.set(PDFName.of('AcroForm'), doc.context.obj({ Fields: [doc.context.register(field)], SigFlags: 1 }));
    });
    const parsed = await parsePdfBytes(ab(source));
    await expect(buildRemediatedPdf(parsed, 'en-US', ab(source))).resolves.toBeInstanceOf(Uint8Array);
  });

  it('keeps existing ViewerPreferences entries when setting DisplayDocTitle', async () => {
    const source = await untaggedPdf((doc) => {
      doc.catalog.set(PDFName.of('ViewerPreferences'), doc.context.obj({ HideToolbar: true, Direction: 'R2L' }));
    });
    const { out } = await remediate(source, { strictPdfUa: true });
    const result = await PDFDocument.load(out);
    const prefs = result.catalog.lookup(PDFName.of('ViewerPreferences')) as PDFDict;
    expect(prefs.get(PDFName.of('DisplayDocTitle'))).toBe(PDFBool.True);
    expect(prefs.get(PDFName.of('HideToolbar'))).toBe(PDFBool.True);
    expect(prefs.get(PDFName.of('Direction'))?.toString()).toBe('/R2L');
  });

  it('merges into an existing XMP packet, keeping PDF/A, rights and unknown properties', async () => {
    const packet = [
      '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
      '<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" pdfaid:part="2" pdfaid:conformance="B"/>',
      '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:foo="http://example.com/foo/">',
      '<dc:title><rdf:Alt><rdf:li xml:lang="x-default">Campus Safety Plan</rdf:li></rdf:Alt></dc:title>',
      '<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">© UC Regents</rdf:li></rdf:Alt></dc:rights>',
      '<xmp:CreatorTool>Microsoft Word</xmp:CreatorTool>',
      '<foo:reviewer>Office of Accessibility</foo:reviewer>',
      '</rdf:Description></rdf:RDF></x:xmpmeta>',
      '<?xpacket end="w"?>'
    ].join('\n');
    const source = await untaggedPdf((doc) => {
      const stream = doc.context.stream(new TextEncoder().encode(packet), { Type: 'Metadata', Subtype: 'XML' });
      doc.catalog.set(PDFName.of('Metadata'), doc.context.register(stream));
    });
    const { out, reparsed } = await remediate(source);
    const xmp = xmpOf(await PDFDocument.load(out));

    expect(xmp).toContain('pdfaid:part="2"');
    expect(xmp).toContain('pdfaid:conformance="B"');
    expect(xmp).toContain('© UC Regents');
    expect(xmp).toContain('<foo:reviewer>Office of Accessibility</foo:reviewer>');
    expect(xmp).toContain('<xmp:CreatorTool>Microsoft Word</xmp:CreatorTool>');
    expect(xmp.match(/<dc:title>/g)).toHaveLength(1);
    expect(xmp.match(/<xmp:CreatorTool>/g)).toHaveLength(1);
    expect(xmp).toContain('<pdf:Producer>PDF Remediator</pdf:Producer>');
    // The XMP title fills the missing Info title instead of a placeholder.
    expect(reparsed.title).toBe('Campus Safety Plan');
  });

  it('falls back to a fresh packet that still carries PDF/A identification when the old one cannot be merged', async () => {
    const packet =
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      '<rdf:Description rdf:about="" xmlns:d="http://purl.org/dc/elements/1.1/" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">' +
      '<d:title><rdf:Alt><rdf:li xml:lang="x-default">Odd prefix</rdf:li></rdf:Alt></d:title><pdfaid:part>1</pdfaid:part>' +
      '<pdfaid:conformance>A</pdfaid:conformance></rdf:Description></rdf:RDF></x:xmpmeta>';
    const source = await untaggedPdf((doc) => {
      const stream = doc.context.stream(new TextEncoder().encode(packet), { Type: 'Metadata', Subtype: 'XML' });
      doc.catalog.set(PDFName.of('Metadata'), doc.context.register(stream));
    });
    const xmp = xmpOf(await PDFDocument.load((await remediate(source)).out));
    expect(xmp).not.toContain('xmlns:d=');
    expect(xmp).toContain('<pdfaid:part>1</pdfaid:part>');
    expect(xmp).toContain('<pdfaid:conformance>A</pdfaid:conformance>');
  });
});

describe('alt text Figures follow reading order', () => {
  it('inserts a new Figure after the element painted just before the image', async () => {
    const source = await taggedPdf({ paras: ['First paragraph.', 'Second paragraph.', 'Third paragraph.', 'Fourth paragraph.'], image: true, lang: 'en-US', title: 'T' });
    const parsed = await parsePdfBytes(ab(source));
    expect(parsed.images).toHaveLength(1);
    const outcome = await applyManualAltText(source, [{ imageId: parsed.images[0]!.id, alt: 'Bar chart of enrollment', decorative: false }], { 1: 1 });
    expect(outcome.applied).toHaveLength(1);

    const result = await PDFDocument.load(outcome.bytes);
    const root = result.catalog.lookup(PDFName.of('StructTreeRoot')) as PDFDict;
    const documentElem = root.lookup(PDFName.of('K')) as PDFDict;
    const kids = documentElem.lookup(PDFName.of('K')) as PDFArray;
    const roles = kids.asArray().map((ref) => (result.context.lookup(ref) as PDFDict).get(PDFName.of('S'))?.toString());
    expect(roles).toEqual(['/P', '/P', '/Figure', '/P', '/P']);

    const reparsed = await parsePdfBytes(ab(outcome.bytes));
    expect(reparsed.images[0]?.alt).toBe('Bar chart of enrollment');
  });
});
