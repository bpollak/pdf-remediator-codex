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

export interface ParsedPDF {
  pageCount: number;
  metadata: Record<string, string | undefined>;
  language?: string;
  title?: string;
  hasStructTree: boolean;
  tags: Array<{ type: string; page?: number; text?: string; alt?: string; scope?: string }>;
  textItems: TextItem[];
  images: ImageItem[];
  links: Array<{ text: string; url: string; page: number }>;
  outlines: Array<{ title: string; page: number }>;
  forms: Array<{ name: string; label?: string; required?: boolean }>;
}
