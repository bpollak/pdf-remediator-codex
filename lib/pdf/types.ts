export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
  fontSize: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  page: number;
}

export interface ImageItem {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  alt?: string;
  decorative?: boolean;
  markedContentId?: number;
}

export interface StructureBindingSummary {
  structElemCount: number;
  structElemWithPageRef: number;
  structElemWithMcid: number;
  structElemWithNumericK: number;
  structElemWithMcr: number;
  hasParentTree: boolean;
  hasParentTreeEntries: boolean;
  tableStructCount: number;
  rowStructCount: number;
  headerCellStructCount: number;
  dataCellStructCount: number;
  hasContentBinding: boolean;
}

export type RemediationMode = 'analysis-only' | 'content-bound';

/** Page box (CropBox, else MediaBox) in PDF user space. */
export interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How much of the page text a screen reader reaches through the tag tree:
 * non-whitespace characters inside marked content whose MCID the ParentTree
 * maps to a structure element, versus the rest. Artifacts are not counted.
 */
export interface TextTagCoverage {
  taggedChars: number;
  untaggedChars: number;
}

export interface ParsedPDF {
  pageCount: number;
  metadata: Record<string, string | undefined>;
  language?: string;
  /**
   * True when /Lang was set by this tool to a default because the original
   * document had no language (recorded in the remediation manifest). A
   * person still has to confirm it.
   */
  languageAssumed?: boolean;
  title?: string;
  remediationMode?: RemediationMode;
  hasStructTree: boolean;
  structureBinding?: StructureBindingSummary;
  /** Only present when the document has a structure tree. */
  textTagCoverage?: TextTagCoverage;
  /** One entry per page, in page order. Absent for hand-built data. */
  pageBoxes?: PageBox[];
  tags: Array<{ type: string; page?: number; text?: string; alt?: string; scope?: string; markedContentId?: number }>;
  textItems: TextItem[];
  images: ImageItem[];
  links: Array<{ text: string; url: string; page: number }>;
  outlines: Array<{ title: string; page: number }>;
  forms: Array<{
    name: string;
    label?: string;
    required?: boolean;
    page?: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }>;
}
