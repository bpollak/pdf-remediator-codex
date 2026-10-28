/**
 * XMP metadata packet for remediated output. PDF/UA-1 requires the catalog
 * /Metadata stream to carry dc:title and the pdfuaid:part identifier; the
 * identifier is only written when the caller claims it.
 *
 * When the source already has an XMP packet, the properties written here
 * replace their old values and every other property (pdfaid, dc:rights,
 * custom schemas) is kept as it was.
 */
export interface XmpMetadataInput {
  title?: string;
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

const NAMESPACES: Record<string, string> = {
  dc: 'http://purl.org/dc/elements/1.1/',
  pdf: 'http://ns.adobe.com/pdf/1.3/',
  xmp: 'http://ns.adobe.com/xap/1.0/',
  pdfuaid: 'http://www.aiim.org/pdfua/ns/id/'
};

/**
 * Properties this module owns. They are removed from an existing packet
 * before the new values are added, even when no new value is written for
 * pdfuaid:part (so a stale claim does not survive).
 */
const MANAGED_PROPERTIES = [
  'dc:format',
  'dc:title',
  'dc:creator',
  'dc:description',
  'dc:language',
  'pdf:Keywords',
  'pdf:Producer',
  'xmp:CreatorTool',
  'xmp:CreateDate',
  'xmp:ModifyDate',
  'xmp:MetadataDate',
  'pdfuaid:part'
];

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function xmpDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Property elements for the values the caller supplied, in a fixed order. */
function propertyLines(input: XmpMetadataInput, keepExisting: Set<string>): string[] {
  const lines: string[] = [];
  const add = (property: string, line: string) => {
    if (!keepExisting.has(property)) lines.push(line);
  };

  add('dc:format', '<dc:format>application/pdf</dc:format>');
  if (input.title) {
    add('dc:title', `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(input.title)}</rdf:li></rdf:Alt></dc:title>`);
  }
  if (input.author) add('dc:creator', `<dc:creator><rdf:Seq><rdf:li>${escapeXml(input.author)}</rdf:li></rdf:Seq></dc:creator>`);
  if (input.subject) {
    add(
      'dc:description',
      `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(input.subject)}</rdf:li></rdf:Alt></dc:description>`
    );
  }
  if (input.language) add('dc:language', `<dc:language><rdf:Bag><rdf:li>${escapeXml(input.language)}</rdf:li></rdf:Bag></dc:language>`);
  if (input.keywords) add('pdf:Keywords', `<pdf:Keywords>${escapeXml(input.keywords)}</pdf:Keywords>`);
  if (input.producer) add('pdf:Producer', `<pdf:Producer>${escapeXml(input.producer)}</pdf:Producer>`);
  if (input.creatorTool) add('xmp:CreatorTool', `<xmp:CreatorTool>${escapeXml(input.creatorTool)}</xmp:CreatorTool>`);
  if (input.createdAt) add('xmp:CreateDate', `<xmp:CreateDate>${xmpDate(input.createdAt)}</xmp:CreateDate>`);
  add('xmp:ModifyDate', `<xmp:ModifyDate>${xmpDate(input.modifiedAt)}</xmp:ModifyDate>`);
  add('xmp:MetadataDate', `<xmp:MetadataDate>${xmpDate(input.modifiedAt)}</xmp:MetadataDate>`);
  if (input.pdfUaPart) add('pdfuaid:part', `<pdfuaid:part>${escapeXml(input.pdfUaPart)}</pdfuaid:part>`);
  return lines;
}

function descriptionOpenTag(about: string, extraNamespaces = ''): string {
  return (
    `<rdf:Description rdf:about="${escapeXml(about)}"` +
    Object.entries(NAMESPACES)
      .map(([prefix, uri]) => ` xmlns:${prefix}="${uri}"`)
      .join('') +
    extraNamespaces +
    '>'
  );
}

function hasProperty(packet: string, property: string): boolean {
  const name = escapeRegExp(property);
  return new RegExp(`<${name}[\\s/>]`).test(packet) || new RegExp(`\\s${name}\\s*=\\s*["']`).test(packet);
}

function removeProperty(packet: string, property: string): string {
  const name = escapeRegExp(property);
  return packet
    .replace(new RegExp(`<${name}(?:\\s[^>]*)?/>`, 'g'), '')
    .replace(new RegExp(`<${name}(?:\\s[^>]*)?>[\\s\\S]*?</${name}\\s*>`, 'g'), '')
    .replace(new RegExp(`\\s${name}\\s*=\\s*(?:"[^"]*"|'[^']*')`, 'g'), '');
}

/**
 * Splices the managed properties into an existing packet. Returns undefined
 * when the packet is not something a text-level merge can handle safely
 * (no single rdf:RDF element, or one of our namespaces bound to another
 * prefix), so the caller can fall back to a fresh packet.
 */
function mergeIntoPacket(existing: string, input: XmpMetadataInput): string | undefined {
  if (existing.includes('\u0000')) return undefined;
  if ((existing.match(/<rdf:RDF[\s>]/g) ?? []).length !== 1) return undefined;
  if ((existing.match(/<\/rdf:RDF\s*>/g) ?? []).length !== 1) return undefined;

  for (const [prefix, uri] of Object.entries(NAMESPACES)) {
    const declarations = [...existing.matchAll(/xmlns:([\w.-]+)\s*=\s*["']([^"']*)["']/g)];
    for (const [, declaredPrefix, declaredUri] of declarations) {
      if (declaredUri === uri && declaredPrefix !== prefix) return undefined;
      if (declaredPrefix === prefix && declaredUri !== uri) return undefined;
    }
  }

  const keepExisting = new Set<string>();
  // The original authoring tool stays recorded; only fill it when missing.
  if (hasProperty(existing, 'xmp:CreatorTool')) keepExisting.add('xmp:CreatorTool');

  let merged = existing;
  for (const property of MANAGED_PROPERTIES) {
    if (keepExisting.has(property)) continue;
    merged = removeProperty(merged, property);
    if (hasProperty(merged, property)) return undefined;
  }

  const about = existing.match(/rdf:about\s*=\s*["']([^"']*)["']/)?.[1] ?? '';
  const description = [descriptionOpenTag(about), ...propertyLines(input, keepExisting), '</rdf:Description>'].join('\n');
  return merged.replace(/<\/rdf:RDF\s*>/, `${description}\n</rdf:RDF>`);
}

/**
 * Properties worth carrying into a fresh packet when the old one cannot be
 * merged: PDF/A identification and the rights statement.
 */
function carriedOverProperties(existing: string | undefined): { lines: string[]; namespaces: string } {
  if (!existing) return { lines: [], namespaces: '' };
  const lines: string[] = [];
  for (const property of ['pdfaid:part', 'pdfaid:conformance']) {
    const value =
      existing.match(new RegExp(`<${property}>\\s*([^<]*?)\\s*</${property}>`))?.[1] ??
      existing.match(new RegExp(`${property}\\s*=\\s*["']([^"']*)["']`))?.[1];
    if (value) lines.push(`<${property}>${value}</${property}>`);
  }
  const rights = existing.match(/<dc:rights[\s>][\s\S]*?<\/dc:rights>/)?.[0];
  if (rights) lines.push(rights);
  const namespaces = lines.some((line) => line.startsWith('<pdfaid:'))
    ? ' xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"'
    : '';
  return { lines, namespaces };
}

export function buildXmpMetadata(input: XmpMetadataInput, existingPacket?: string): Uint8Array {
  if (existingPacket) {
    const merged = mergeIntoPacket(existingPacket, input);
    if (merged) return new TextEncoder().encode(merged);
  }

  const carried = carriedOverProperties(existingPacket);
  const lines: string[] = [];
  const add = (line: string) => lines.push(line);

  add('<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>');
  add('<x:xmpmeta xmlns:x="adobe:ns:meta/">');
  add('<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">');
  add(descriptionOpenTag('', carried.namespaces));
  lines.push(...propertyLines(input, new Set()));
  lines.push(...carried.lines);
  add('</rdf:Description>');
  add('</rdf:RDF>');
  add('</x:xmpmeta>');
  add('<?xpacket end="w"?>');

  return new TextEncoder().encode(lines.join('\n'));
}
