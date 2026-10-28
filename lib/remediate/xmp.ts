/**
 * Minimal XMP metadata packet for remediated output. PDF/UA-1 requires the
 * catalog /Metadata stream to carry dc:title and the pdfuaid:part
 * identifier; the identifier is only written when the caller claims it.
 */
export interface XmpMetadataInput {
  title: string;
  author?: string;
  subject?: string;
  keywords?: string;
  language?: string;
  creatorTool?: string;
  producer?: string;
  createdAt?: Date;
  modifiedAt: Date;
  pdfUaPart?: string;
}

function escapeXml(value: string): string {
  return (
    value
      // Characters not allowed in XML 1.0.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  );
}

function xmpDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function buildXmpMetadata(input: XmpMetadataInput): Uint8Array {
  const lines: string[] = [];
  const add = (line: string) => lines.push(line);

  add('<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>');
  add('<x:xmpmeta xmlns:x="adobe:ns:meta/">');
  add('<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">');
  add(
    '<rdf:Description rdf:about=""' +
      ' xmlns:dc="http://purl.org/dc/elements/1.1/"' +
      ' xmlns:pdf="http://ns.adobe.com/pdf/1.3/"' +
      ' xmlns:xmp="http://ns.adobe.com/xap/1.0/"' +
      (input.pdfUaPart ? ' xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/"' : '') +
      '>'
  );
  add('<dc:format>application/pdf</dc:format>');
  add(`<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(input.title)}</rdf:li></rdf:Alt></dc:title>`);
  if (input.author) add(`<dc:creator><rdf:Seq><rdf:li>${escapeXml(input.author)}</rdf:li></rdf:Seq></dc:creator>`);
  if (input.subject) {
    add(
      `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(input.subject)}</rdf:li></rdf:Alt></dc:description>`
    );
  }
  if (input.language) add(`<dc:language><rdf:Bag><rdf:li>${escapeXml(input.language)}</rdf:li></rdf:Bag></dc:language>`);
  if (input.keywords) add(`<pdf:Keywords>${escapeXml(input.keywords)}</pdf:Keywords>`);
  if (input.producer) add(`<pdf:Producer>${escapeXml(input.producer)}</pdf:Producer>`);
  if (input.creatorTool) add(`<xmp:CreatorTool>${escapeXml(input.creatorTool)}</xmp:CreatorTool>`);
  if (input.createdAt) add(`<xmp:CreateDate>${xmpDate(input.createdAt)}</xmp:CreateDate>`);
  add(`<xmp:ModifyDate>${xmpDate(input.modifiedAt)}</xmp:ModifyDate>`);
  add(`<xmp:MetadataDate>${xmpDate(input.modifiedAt)}</xmp:MetadataDate>`);
  if (input.pdfUaPart) add(`<pdfuaid:part>${escapeXml(input.pdfUaPart)}</pdfuaid:part>`);
  add('</rdf:Description>');
  add('</rdf:RDF>');
  add('</x:xmpmeta>');
  add('<?xpacket end="w"?>');

  return new TextEncoder().encode(lines.join('\n'));
}
