import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { parsePdfBytes } from '@/lib/pdf/parser';

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe('parsePdfBytes image extraction', () => {
  it('extracts rendered image bounding boxes from page operator streams', { timeout: 30000 }, async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZlE0AAAAASUVORK5CYII=',
      'base64'
    );
    const image = await pdf.embedPng(pngBytes);
    page.drawImage(image, { x: 90, y: 420, width: 180, height: 90 });

    const bytes = await pdf.save();
    const parsed = await parsePdfBytes(toArrayBuffer(bytes));

    expect(parsed.images.length).toBeGreaterThan(0);
    const extracted = parsed.images[0]!;
    expect(extracted.page).toBe(1);
    expect(extracted.width).toBeGreaterThan(100);
    expect(extracted.height).toBeGreaterThan(40);
  });
});

