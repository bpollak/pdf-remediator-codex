import { describe, expect, it } from 'vitest';
import { MAX_OCR_LINES, MAX_OCR_TEXT_CHARS, parseOcrExtraction } from '@/lib/ocr/response';

describe('OCR extraction completeness', () => {
  it('keeps long lines and more than 120 lines without losing any text', () => {
    const lines = Array.from({ length: 130 }, (_, i) => ({ text: `Line ${i}: ${'text '.repeat(80).trim()}` }));
    const result = parseOcrExtraction(JSON.stringify({ lines }), 'stop');
    expect(result).toEqual({ lines, complete: true });
    expect(result.lines[0].text.length).toBeGreaterThan(240);
  });
  it('keeps one-character labels and non-Latin text', () => {
    expect(parseOcrExtraction(JSON.stringify({ lines: ['A', '中文 Ελληνικά'] })).lines).toEqual([{ text: 'A' }, { text: '中文 Ελληνικά' }]);
  });
  it('marks a token cutoff incomplete even when its JSON is valid', () => {
    const result = parseOcrExtraction('{"lines":["First line","Second line"]}', 'length');
    expect(result.complete).toBe(false);
    expect(result.lines).toHaveLength(2);
    expect(result.warning).toMatch(/stopped/);
  });
  it('does not mistake malformed or cut-off JSON for visible page text', () => {
    const result = parseOcrExtraction('{"lines":[{"text":"half a sentence', 'length');
    expect(result).toMatchObject({ complete: false, lines: [] });
  });
  it('supports plain text output but never counts an empty response as complete', () => {
    expect(parseOcrExtraction('First line\nSecond line', 'stop').complete).toBe(true);
    expect(parseOcrExtraction('{"lines":[]}').complete).toBe(false);
  });
  it('reports explicit resource limits instead of silently clipping text', () => {
    const many = parseOcrExtraction(JSON.stringify({ lines: Array.from({ length: MAX_OCR_LINES + 1 }, () => 'A') }));
    expect(many.lines).toHaveLength(MAX_OCR_LINES);
    expect(many.complete).toBe(false);
    expect(many.warning).toMatch(/limit/);
    const long = parseOcrExtraction(JSON.stringify({ lines: ['x'.repeat(MAX_OCR_TEXT_CHARS + 1)] }));
    expect(long).toMatchObject({ lines: [], complete: false });
  });
});
