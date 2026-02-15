import type { ParsedPDF } from '@/lib/pdf/types';
import { detectHeadings, detectListItems } from './heuristics';

export function extractRemediationPlan(parsed: ParsedPDF) {
  return {
    headings: detectHeadings(parsed),
    listItems: detectListItems(parsed),
    images: parsed.images,
    textItems: parsed.textItems,
    links: parsed.links,
    metadata: parsed.metadata,
    pageCount: parsed.pageCount
  };
}
