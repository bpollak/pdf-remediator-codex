export async function validatePdfFile(file: File): Promise<boolean> {
  if (file.size > 50 * 1024 * 1024) return false;
  if (!file.name.toLowerCase().endsWith('.pdf')) return false;
  const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
