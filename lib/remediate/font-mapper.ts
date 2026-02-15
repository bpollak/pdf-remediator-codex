export type StandardFont = 'TimesRoman' | 'Helvetica' | 'Courier';

export function mapFontName(original: string): StandardFont {
  const lower = original.toLowerCase();
  if (lower.includes('courier') || lower.includes('mono')) return 'Courier';
  if (lower.includes('times') || lower.includes('serif')) return 'TimesRoman';
  return 'Helvetica';
}
