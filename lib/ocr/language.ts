export function mapToTesseractLang(language?: string): string {
  if (!language) return 'eng';
  const normalized = language.toLowerCase();
  if (normalized.startsWith('en')) return 'eng';
  if (normalized.startsWith('es')) return 'spa';
  if (normalized.startsWith('fr')) return 'fra';
  if (normalized.startsWith('de')) return 'deu';
  if (normalized.startsWith('it')) return 'ita';
  if (normalized.startsWith('pt')) return 'por';
  return 'eng';
}
