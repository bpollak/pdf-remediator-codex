import { stripJsonFences } from '@/lib/tritonai/gateway';

export interface OcrExtraction {
  lines: Array<{ text: string }>;
  /** False if output was cut off, malformed, empty, or exceeded a resource limit. */
  complete: boolean;
  warning?: string;
}

export const MAX_OCR_LINES = 5_000;
export const MAX_OCR_TEXT_CHARS = 250_000;

/** Preserve line text in full; limits are explicit incomplete results, never silent slices. */
export function parseOcrExtraction(content: unknown, finishReason?: string): OcrExtraction {
  if (typeof content !== 'string' || !content.trim()) throw new Error('OCR returned no text.');
  let rawLines: unknown[];
  let modelIncomplete = false;
  const cleaned = stripJsonFences(content);
  try {
    const parsed = JSON.parse(cleaned);
    rawLines = Array.isArray(parsed?.lines) ? parsed.lines : typeof parsed?.text === 'string' ? parsed.text.split(/\r?\n/) : [];
    modelIncomplete = parsed?.complete === false;
  } catch {
    // A truncated JSON document is not page text. Never embed JSON syntax as OCR.
    if (/^[{[]/.test(cleaned)) return { lines: [], complete: false, warning: 'OCR returned an incomplete structured response.' };
    rawLines = cleaned.split(/\r?\n/);
  }
  const lines: OcrExtraction['lines'] = [];
  let characters = 0;
  let limited = false;
  for (const value of rawLines) {
    const raw = typeof value === 'string' ? value : value && typeof value === 'object' ? (value as { text?: unknown }).text : undefined;
    if (typeof raw !== 'string') { modelIncomplete = true; continue; }
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (lines.length >= MAX_OCR_LINES || characters + text.length > MAX_OCR_TEXT_CHARS) { limited = true; break; }
    lines.push({ text });
    characters += text.length;
  }
  const cutOff = Boolean(finishReason && finishReason !== 'stop');
  const complete = lines.length > 0 && !limited && !cutOff && !modelIncomplete;
  return {
    lines,
    complete,
    ...(!complete ? { warning: limited ? 'OCR exceeded the safe text limit for this page.' : cutOff ? 'OCR stopped before the page was fully extracted.' : 'OCR could not extract complete text for this page.' } : {})
  };
}
