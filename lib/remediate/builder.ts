import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { ParsedPDF } from '@/lib/pdf/types';
import { extractRemediationPlan } from './extractor';
import { mapFontName } from './font-mapper';
import { buildTagTree, type TagNode } from './tagger';
import { encodeManifest, MANIFEST_PREFIX } from './manifest';

const MAX_TAGS_IN_MANIFEST = 1200;
const MAX_TEXT_LENGTH = 160;
const MAX_LINKS_IN_MANIFEST = 300;
const MAX_IMAGES_IN_MANIFEST = 300;
const MAX_FORMS_IN_MANIFEST = 300;
const MAX_OCR_TEXT_LAYER_ITEMS = 20000;

const genericLinkTextPattern = /^(click here|read more|learn more|more|https?:\/\/)/i;
const listPattern = /^([\u2022\-*]|\d+[.)]|[a-zA-Z][.)])\s+/;

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

function truncateText(value: string | undefined, maxLength = MAX_TEXT_LENGTH): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function splitKeywords(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function flattenTagTree(nodes: TagNode[] | undefined): Array<{ type: string; page?: number; text?: string }> {
  if (!nodes?.length) return [];
  const flat: Array<{ type: string; page?: number; text?: string }> = [];

  for (const node of nodes) {
    flat.push({
      type: node.type,
      page: node.page,
      text: truncateText(node.text)
    });

    if (node.children?.length) {
      flat.push(...flattenTagTree(node.children));
    }
  }

  return flat;
}

function dedupeTags(
  tags: Array<{ type: string; page?: number; text?: string; alt?: string; scope?: string }>
): Array<{ type: string; page?: number; text?: string; alt?: string; scope?: string }> {
  const deduped: Array<{ type: string; page?: number; text?: string; alt?: string; scope?: string }> = [];
  const seen = new Set<string>();

  for (const tag of tags) {
    if (!tag.type) continue;
    const normalizedTag = {
      ...tag,
      text: truncateText(tag.text),
      alt: truncateText(tag.alt),
      scope: truncateText(tag.scope, 40)
    };
    const key = `${normalizedTag.type}|${normalizedTag.page ?? ''}|${normalizedTag.text ?? ''}|${normalizedTag.alt ?? ''}|${normalizedTag.scope ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(normalizedTag);
    if (deduped.length >= MAX_TAGS_IN_MANIFEST) break;
  }

  return deduped;
}

function inferImageAltText(parsed: ParsedPDF, image: ParsedPDF['images'][number]): string {
  const nearestText = parsed.textItems
    .filter((item) => item.page === image.page)
    .map((item) => ({ ...item, text: item.text.replace(/\s+/g, ' ').trim() }))
    .filter((item) => item.text.length >= 8 && !listPattern.test(item.text))
    .sort((a, b) => {
      const aDistance = Math.abs(a.y - image.y) + Math.abs(a.x - image.x) * 0.15;
      const bDistance = Math.abs(b.y - image.y) + Math.abs(b.x - image.x) * 0.15;
      return aDistance - bDistance;
    })[0];

  if (nearestText?.text) return truncateText(nearestText.text, 120) ?? `Illustration on page ${image.page}`;
  return `Illustration on page ${image.page}`;
}

function normalizeLinks(links: ParsedPDF['links']): ParsedPDF['links'] {
  return links.slice(0, MAX_LINKS_IN_MANIFEST).map((link) => {
    const rawText = link.text?.replace(/\s+/g, ' ').trim() ?? '';
    if (rawText && !genericLinkTextPattern.test(rawText)) return { ...link, text: truncateText(rawText, 140) ?? rawText };

    try {
      const parsedUrl = new URL(link.url);
      const segment = parsedUrl.pathname.split('/').filter(Boolean).pop();
      const suffix = segment ? ` ${segment.replace(/[-_]+/g, ' ')}` : '';
      return {
        ...link,
        text: truncateText(`Visit ${parsedUrl.hostname}${suffix}`, 140) ?? 'Visit linked page'
      };
    } catch {
      return {
        ...link,
        text: 'Visit linked page'
      };
    }
  });
}

function normalizeForms(forms: ParsedPDF['forms']): ParsedPDF['forms'] {
  return forms.slice(0, MAX_FORMS_IN_MANIFEST).map((form) => ({
    ...form,
    name: truncateText(form.name, 120) ?? form.name,
    label:
      truncateText(form.label, 120) ??
      truncateText(
        form.name
          .replace(/[-_]+/g, ' ')
          .replace(/\b\w/g, (char) => char.toUpperCase()),
        120
      )
  }));
}

function normalizeImages(parsed: ParsedPDF): ParsedPDF['images'] {
  return parsed.images.slice(0, MAX_IMAGES_IN_MANIFEST).map((image) => {
    if (image.decorative) return image;
    if (image.alt?.trim()) return { ...image, alt: truncateText(image.alt, 120) };
    return {
      ...image,
      alt: inferImageAltText(parsed, image)
    };
  });
}

function buildSemanticTags(parsed: ParsedPDF, plan: ReturnType<typeof extractRemediationPlan>): ParsedPDF['tags'] {
  const sourceTags = plan.sourceTags.filter(
    (tag) => !/^H[1-6]$/.test(tag.type) && !['Document', 'L', 'LI', 'Lbl', 'LBody'].includes(tag.type)
  );

  const headingTags = plan.headings.map((heading) => ({
    type: `H${heading.level}`,
    page: heading.page,
    text: truncateText(heading.text)
  }));

  const listTags = plan.listItems.flatMap((item) => {
    const marker = item.text.split(/\s+/, 1)[0] ?? '';
    return [
      { type: 'L', page: item.page },
      { type: 'LI', page: item.page },
      { type: 'Lbl', page: item.page, text: truncateText(marker, 20) },
      { type: 'LBody', page: item.page, text: truncateText(item.text) }
    ];
  });

  const tagTree = buildTagTree(plan);
  const treeTags = flattenTagTree(tagTree.children);

  return dedupeTags([{ type: 'Document' }, ...sourceTags, ...headingTags, ...listTags, ...treeTags]).slice(
    0,
    MAX_TAGS_IN_MANIFEST
  );
}

function parseColor(color?: string) {
  if (!color || !/^#?[0-9a-f]{6}$/i.test(color)) return rgb(0, 0, 0);
  const normalized = color.startsWith('#') ? color.slice(1) : color;
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

async function embedInvisibleOcrTextLayer(pdf: PDFDocument, parsed: ParsedPDF) {
  const ocrTextItems = parsed.textItems.filter((item) => item.fontName === 'OCR').slice(0, MAX_OCR_TEXT_LAYER_ITEMS);
  if (!ocrTextItems.length) return;

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();

  for (const item of ocrTextItems) {
    const page = pages[item.page - 1];
    if (!page) continue;

    const safeText = sanitizeTextForFont(font, item.text).trim();
    if (!safeText) continue;

    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const x = Math.min(Math.max(item.x, 0), Math.max(0, pageWidth - 1));
    const y = Math.min(Math.max(item.y, 0), Math.max(0, pageHeight - 1));

    page.drawText(safeText, {
      x,
      y,
      size: Math.max(6, Math.min(item.fontSize, 72)),
      font,
      color: rgb(0, 0, 0),
      opacity: 0
    });
  }
}

export interface BuildRemediatedPdfOptions {
  addInvisibleTextLayer?: boolean;
}

export async function buildRemediatedPdf(
  parsed: ParsedPDF,
  language: string,
  sourceBytes?: ArrayBuffer | Uint8Array,
  options: BuildRemediatedPdfOptions = {}
) {
  const chosenLanguage = language || parsed.language || 'en-US';
  const plan = extractRemediationPlan(parsed);
  const tags = buildSemanticTags(parsed, plan);
  const outlines =
    plan.outlines.length > 0
      ? plan.outlines.map((outline) => ({
          ...outline,
          title: truncateText(outline.title, 140) ?? outline.title
        }))
      : plan.headings.slice(0, 40).map((heading) => ({ title: heading.text, page: heading.page }));

  const normalizedLinks = normalizeLinks(parsed.links);
  const normalizedForms = normalizeForms(parsed.forms);
  const normalizedImages = normalizeImages(parsed);

  const manifest = {
    hasStructTree: true,
    language: chosenLanguage,
    tags,
    outlines: outlines.slice(0, 120),
    forms: normalizedForms,
    images: normalizedImages,
    links: normalizedLinks,
    pdfUaPart: '1'
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
    await embedInvisibleOcrTextLayer(pdf, parsed);
  }

  const existingKeywords = new Set(
    [...splitKeywords(pdf.getKeywords()), ...splitKeywords(parsed.metadata.Keywords)].filter(
      (keyword) => !keyword.startsWith(MANIFEST_PREFIX)
    )
  );
  existingKeywords.add('accessible');
  existingKeywords.add('wcag');
  existingKeywords.add('remediated');
  const encodedManifest = encodeManifest(manifest);
  existingKeywords.add(encodedManifest);

  pdf.setLanguage(chosenLanguage);
  pdf.setTitle(parsed.title ?? pdf.getTitle() ?? 'Remediated PDF');
  pdf.setAuthor(parsed.metadata.Author ?? pdf.getAuthor() ?? 'UC San Diego Accessible PDF');
  pdf.setSubject(parsed.metadata.Subject ?? pdf.getSubject() ?? 'Accessibility remediated document');
  pdf.setKeywords([...existingKeywords]);

  return pdf.save();
}
