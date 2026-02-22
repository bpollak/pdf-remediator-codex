import { PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib';
import type { ParsedPDF } from '@/lib/pdf/types';
import { extractRemediationPlan } from './extractor';
import { mapFontName } from './font-mapper';
import { buildTagTree, type TagNode } from './tagger';
import { injectStructTree } from './struct-tree';
import { encodeManifest, MANIFEST_PREFIX } from './manifest';
import { LIST_ITEM_PATTERN } from '@/lib/utils/patterns';
import type { VerapdfResult } from '@/lib/verapdf/types';

const MAX_TAGS_IN_MANIFEST = 1200;
const MAX_TEXT_LENGTH = 160;
const MAX_LINKS_IN_MANIFEST = 300;
const MAX_IMAGES_IN_MANIFEST = 300;
const MAX_FORMS_IN_MANIFEST = 300;
const MAX_OCR_TEXT_LAYER_ITEMS = 20000;

const genericLinkTextPattern = /^(click here|read more|learn more|more|https?:\/\/)/i;

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
  const stack = [...nodes].reverse();
  const visited = new WeakSet<object>();

  while (stack.length > 0 && flat.length < MAX_TAGS_IN_MANIFEST) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (visited.has(node)) continue;
    visited.add(node);

    flat.push({
      type: node.type,
      page: node.page,
      text: truncateText(node.text)
    });

    if (!node.children?.length) continue;
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];
      if (child) stack.push(child);
    }
  }

  return flat;
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

type CandidateTextItem = { text: string; x: number; y: number };

function buildPageTextIndex(parsed: ParsedPDF): Map<number, CandidateTextItem[]> {
  const index = new Map<number, CandidateTextItem[]>();
  for (const item of parsed.textItems) {
    const text = item.text.replace(/\s+/g, ' ').trim();
    if (text.length < 8 || LIST_ITEM_PATTERN.test(text)) continue;
    let bucket = index.get(item.page);
    if (!bucket) { bucket = []; index.set(item.page, bucket); }
    bucket.push({ text, x: item.x, y: item.y });
  }
  return index;
}

const CAPTION_PATTERN = /^(fig(ure)?|table|image|photo|chart|graph|diagram|illustration)\s*\.?\s*\d*/i;
const SMALL_IMAGE_THRESHOLD = 50;

function inferImageAltText(
  pageTextIndex: Map<number, CandidateTextItem[]>,
  image: ParsedPDF['images'][number]
): string {
  // Very small images are likely decorative icons
  if (image.width < SMALL_IMAGE_THRESHOLD && image.height < SMALL_IMAGE_THRESHOLD) {
    return 'Decorative image';
  }

  const candidates = pageTextIndex.get(image.page);
  if (!candidates || candidates.length === 0) return `Illustration on page ${image.page}`;

  // Prefer caption-like text below the image
  const captionCandidates = candidates.filter((item) => {
    const isBelow = item.y < image.y && Math.abs(item.y - image.y) < 60;
    return isBelow && CAPTION_PATTERN.test(item.text);
  });

  if (captionCandidates.length > 0) {
    // Pick the closest caption below the image
    captionCandidates.sort((a, b) => Math.abs(a.y - image.y) - Math.abs(b.y - image.y));
    return truncateText(captionCandidates[0]!.text, 120) ?? `Illustration on page ${image.page}`;
  }

  // Also check for caption-like text regardless of position
  const anyCaptions = candidates.filter((item) => CAPTION_PATTERN.test(item.text));
  if (anyCaptions.length > 0) {
    anyCaptions.sort(
      (a, b) =>
        (Math.abs(a.y - image.y) + Math.abs(a.x - image.x) * 0.15) -
        (Math.abs(b.y - image.y) + Math.abs(b.x - image.x) * 0.15)
    );
    return truncateText(anyCaptions[0]!.text, 120) ?? `Illustration on page ${image.page}`;
  }

  // Fall back to proximity but prefer shorter text (more likely a label)
  let bestText = '';
  let bestScore = Infinity;
  for (const item of candidates) {
    const distance = Math.abs(item.y - image.y) + Math.abs(item.x - image.x) * 0.15;
    // Penalize very long text (likely a paragraph, not a caption)
    const lengthPenalty = item.text.length > 80 ? 50 : 0;
    const score = distance + lengthPenalty;
    if (score < bestScore) {
      bestScore = score;
      bestText = item.text;
    }
  }

  if (bestText) return truncateText(bestText, 120) ?? `Illustration on page ${image.page}`;
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
  const pageTextIndex = buildPageTextIndex(parsed);
  return parsed.images.slice(0, MAX_IMAGES_IN_MANIFEST).map((image) => {
    if (image.decorative) return image;
    // Mark very small images as decorative
    if (image.width < SMALL_IMAGE_THRESHOLD && image.height < SMALL_IMAGE_THRESHOLD) {
      return { ...image, decorative: true, alt: '' };
    }
    if (image.alt?.trim()) return { ...image, alt: truncateText(image.alt, 120) };
    return {
      ...image,
      alt: inferImageAltText(pageTextIndex, image)
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

  // Group consecutive list items under single L nodes (mirrors tagger.ts grouping)
  const listTags: Array<{ type: string; page?: number; text?: string }> = [];
  let prevListPage = -Infinity;
  for (const item of plan.listItems) {
    const marker = item.text.split(/\s+/, 1)[0] ?? '';
    if (Math.abs(item.page - prevListPage) > 1 || listTags.length === 0) {
      listTags.push({ type: 'L', page: item.page });
    }
    listTags.push(
      { type: 'LI', page: item.page },
      { type: 'Lbl', page: item.page, text: truncateText(marker, 20) },
      { type: 'LBody', page: item.page, text: truncateText(item.text) }
    );
    prevListPage = item.page;
  }

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
  strictPdfUa?: boolean;
  verapdfFeedback?: VerapdfResult;
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
    [...splitKeywords(safeReadPdfMetadata(() => pdf.getKeywords())), ...splitKeywords(parsed.metadata.Keywords)].filter(
      (keyword) => !keyword.startsWith(MANIFEST_PREFIX)
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

  // Inject real StructTreeRoot, MarkInfo, RoleMap, and per-page Tabs
  const tagTree = buildTagTree(plan);
  injectStructTree(pdf, tagTree);

  return pdf.save();
}
