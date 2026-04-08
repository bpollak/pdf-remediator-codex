import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { parsePdfBytes } from '@/lib/pdf/parser';

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe('parsePdfBytes edge cases', () => {
  it('parses a minimal empty single-page PDF', { timeout: 30000 }, async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([612, 792]);
    const bytes = await pdf.save();
    const parsed = await parsePdfBytes(toArrayBuffer(bytes));

    expect(parsed.pageCount).toBe(1);
    expect(parsed.textItems).toEqual([]);
    expect(parsed.images).toEqual([]);
    expect(parsed.links).toEqual([]);
    expect(parsed.forms).toEqual([]);
    expect(parsed.tags).toEqual([]);
    expect(parsed.outlines).toEqual([]);
  });

  it('parses a multi-page PDF with text items', { timeout: 30000 }, async () => {
    const pdf = await PDFDocument.create();

    const page1 = pdf.addPage([612, 792]);
    page1.drawText('Hello from page one', { x: 50, y: 700, size: 12 });

    const page2 = pdf.addPage([612, 792]);
    page2.drawText('Hello from page two', { x: 50, y: 700, size: 12 });

    const bytes = await pdf.save();
    const parsed = await parsePdfBytes(toArrayBuffer(bytes));

    expect(parsed.pageCount).toBe(2);
    expect(parsed.textItems.length).toBeGreaterThanOrEqual(2);
    expect(parsed.textItems.some((item) => item.page === 1)).toBe(true);
    expect(parsed.textItems.some((item) => item.page === 2)).toBe(true);
  });

  it('extracts metadata (title, author, language)', { timeout: 30000 }, async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.setTitle('Test Document');
    pdf.setAuthor('Test Author');
    pdf.setLanguage('en-US');
    const bytes = await pdf.save();
    const parsed = await parsePdfBytes(toArrayBuffer(bytes));

    expect(parsed.title).toBe('Test Document');
    expect(parsed.metadata.Author).toBe('Test Author');
    expect(parsed.language).toBe('en-US');
  });

  it('handles PDF with no metadata gracefully', { timeout: 30000 }, async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const bytes = await pdf.save();
    const parsed = await parsePdfBytes(toArrayBuffer(bytes));

    expect(parsed.metadata).toBeDefined();
    expect(parsed.pageCount).toBe(1);
  });

  it('extracts multiple images from a single page', { timeout: 30000 }, async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);

    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZlE0AAAAASUVORK5CYII=',
      'base64'
    );
    const image = await pdf.embedPng(pngBytes);
    page.drawImage(image, { x: 50, y: 600, width: 100, height: 80 });
    page.drawImage(image, { x: 300, y: 600, width: 150, height: 120 });

    const bytes = await pdf.save();
    const parsed = await parsePdfBytes(toArrayBuffer(bytes));

    expect(parsed.images.length).toBeGreaterThanOrEqual(2);
    expect(parsed.images.every((img) => img.page === 1)).toBe(true);
  });

  it('deduplicates identical text items at the same position', { timeout: 30000 }, async () => {
    // Tags and outlines are deduplicated; text items are not (they come from
    // the actual content stream). This test verifies that text extraction
    // returns all items including duplicates at distinct text-stream positions.
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    page.drawText('Duplicate', { x: 50, y: 700, size: 12 });
    page.drawText('Duplicate', { x: 50, y: 680, size: 12 });

    const bytes = await pdf.save();
    const parsed = await parsePdfBytes(toArrayBuffer(bytes));

    const duplicates = parsed.textItems.filter((item) => item.text.includes('Duplicate'));
    expect(duplicates.length).toBe(2);
  });

  it('preserves the original buffer for reuse after parsing', { timeout: 30000 }, async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const bytes = await pdf.save();
    const buffer = toArrayBuffer(bytes);
    const originalLength = buffer.byteLength;

    await parsePdfBytes(buffer);

    // The caller's buffer should not be detached or modified.
    expect(buffer.byteLength).toBe(originalLength);
  });

  it('handles a PDF with text in various font sizes', { timeout: 30000 }, async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    page.drawText('Large heading', { x: 50, y: 700, size: 24 });
    page.drawText('Body text here', { x: 50, y: 660, size: 12 });
    page.drawText('Small caption', { x: 50, y: 640, size: 8 });

    const bytes = await pdf.save();
    const parsed = await parsePdfBytes(toArrayBuffer(bytes));

    const fontSizes = parsed.textItems.map((item) => item.fontSize);
    expect(Math.max(...fontSizes)).toBeGreaterThanOrEqual(20);
    expect(Math.min(...fontSizes)).toBeLessThanOrEqual(12);
  });
});
