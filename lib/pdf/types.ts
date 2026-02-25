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

export interface ParsedPDF {
  pageCount: number;
  metadata: Record<string, string | undefined>;
  language?: string;
  title?: string;
  remediationMode?: RemediationMode;
  hasStructTree: boolean;
  structureBinding?: StructureBindingSummary;
  tags: Array<{ type: string; page?: number; text?: string; alt?: string; scope?: string }>;
  textItems: TextItem[];
  images: ImageItem[];
  links: Array<{ text: string; url: string; page: number }>;
  outlines: Array<{ title: string; page: number }>;
  forms: Array<{ name: string; label?: string; required?: boolean }>;
}
