/** Larger PDFs are refused: parsing and remediating them can exhaust a tab's memory. */
export const MAX_PAGES_PER_FILE = 300;
/** Above this, warn that processing may take several minutes. */
export const LONG_DOCUMENT_PAGE_THRESHOLD = 100;
