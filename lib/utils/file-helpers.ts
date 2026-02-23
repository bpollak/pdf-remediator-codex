const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const HEADER_SCAN_BYTES = 16 * 1024;

export interface PdfFileValidationResult {
  ok: boolean;
  reason?: string;
}

function hasPdfHeader(bytes: Uint8Array): boolean {
  const signature = new TextDecoder().decode(bytes);
  return signature.includes('%PDF-');
}

function isPdfMimeType(type: string | undefined): boolean {
  if (!type) return true;
  const normalized = type.toLowerCase();
  return (
    normalized === 'application/pdf' ||
    normalized === 'application/x-pdf' ||
    normalized === 'application/octet-stream'
  );
}

export async function validatePdfFile(file: File): Promise<PdfFileValidationResult> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, reason: 'File is larger than 50 MB.' };
  }

  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return { ok: false, reason: 'File extension must be .pdf.' };
  }

  try {
    const scanSize = Math.min(file.size, HEADER_SCAN_BYTES);
    const bytes = new Uint8Array(await file.slice(0, scanSize).arrayBuffer());
    if (!hasPdfHeader(bytes)) {
      // Some PDFs include a long preamble before %PDF-. Accept trusted MIME types
      // and defer stricter parsing to the processing pipeline.
      if (!isPdfMimeType(file.type)) {
        return { ok: false, reason: 'File content does not look like a valid PDF.' };
      }
    }
  } catch {
    return { ok: false, reason: 'Could not read the selected file.' };
  }

  return { ok: true };
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
