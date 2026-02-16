import type { ParsedPDF } from '@/lib/pdf/types';
import { detectHeadings, detectListItems, detectParagraphs } from './heuristics';

export function extractRemediationPlan(parsed: ParsedPDF) {
  const headings = detectHeadings(parsed);
  const listItems = detectListItems(parsed);
  const paragraphs = detectParagraphs(parsed);

  return {
    headings,
    listItems,
    paragraphs,
    sourceTags: parsed.tags,
    images: parsed.images,
    textItems: parsed.textItems,
    links: parsed.links,
    outlines: parsed.outlines,
    forms: parsed.forms,
    metadata: parsed.metadata,
    title: parsed.title,
    hasStructTree: parsed.hasStructTree,
    language: parsed.language,
    pageCount: parsed.pageCount
  };
}
