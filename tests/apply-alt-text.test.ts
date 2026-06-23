import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { applyManualAltText } from '@/lib/remediate/apply-alt-text';
import { parsePdfBytes } from '@/lib/pdf/parser';
import { runAudit } from '@/lib/audit/engine';
import type { ParsedPDF } from '@/lib/pdf/types';

// 1x1 red PNG.
const PNG_BYTES = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
  (char) => char.charCodeAt(0)
);

async function createPdfWithImages(imageCount: number): Promise<ArrayBuffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const png = await pdf.embedPng(PNG_BYTES);
  const page = pdf.addPage([612, 792]);

  page.drawText('Quarterly report heading', { x: 50, y: 740, size: 18, font });
  page.drawText('Body paragraph with enough text to anchor the layout.', { x: 50, y: 700, size: 11, font });
  for (let index = 0; index < imageCount; index += 1) {
    page.drawImage(png, { x: 60 + index * 140, y: 480, width: 120, height: 90 });
  }

  const bytes = await pdf.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function pageImageCounts(parsed: ParsedPDF): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const image of parsed.images) {
    counts[image.page] = (counts[image.page] ?? 0) + 1;
  }
  return counts;
}

describe('applyManualAltText', () => {
  it('embeds alt text as content-bound Figure tags that the parser can read back', async () => {
    const sourceBytes = await createPdfWithImages(2);
    const parsed = await parsePdfBytes(sourceBytes.slice(0));
    expect(parsed.images).toHaveLength(2);

    const outcome = await applyManualAltText(
      sourceBytes,
      [
        { imageId: parsed.images[0]!.id, alt: 'Bar chart of quarterly revenue', decorative: false },
        { imageId: parsed.images[1]!.id, alt: 'Campus map with route highlighted', decorative: false }
      ],
      pageImageCounts(parsed)
    );

    expect(outcome.skipped).toEqual([]);
    expect(outcome.applied.sort()).toEqual([parsed.images[0]!.id, parsed.images[1]!.id].sort());

    const reparsed = await parsePdfBytes(
      outcome.bytes.buffer.slice(outcome.bytes.byteOffset, outcome.bytes.byteOffset + outcome.bytes.byteLength)
    );
    expect(reparsed.hasStructTree).toBe(true);
    const figureTags = reparsed.tags.filter((tag) => tag.type === 'Figure');
    expect(figureTags.map((tag) => tag.alt)).toEqual([
      'Bar chart of quarterly revenue',
      'Campus map with route highlighted'
    ]);

    // The parser credits the alt text to the images, so the audit clears the
    // missing-alt finding on re-upload.
    expect(reparsed.images.map((image) => image.alt)).toEqual([
      'Bar chart of quarterly revenue',
      'Campus map with route highlighted'
    ]);
    const audit = runAudit(reparsed);
    expect(audit.findings.filter((finding) => finding.ruleId === 'IMG-001')).toEqual([]);
  });

  it('marks decorative images as artifacts that the parser recognizes', async () => {
    const sourceBytes = await createPdfWithImages(1);
    const parsed = await parsePdfBytes(sourceBytes.slice(0));

    const outcome = await applyManualAltText(
      sourceBytes,
      [{ imageId: parsed.images[0]!.id, alt: '', decorative: true }],
      pageImageCounts(parsed)
    );

    expect(outcome.skipped).toEqual([]);
    expect(outcome.applied).toEqual([parsed.images[0]!.id]);

    const reparsed = await parsePdfBytes(
      outcome.bytes.buffer.slice(outcome.bytes.byteOffset, outcome.bytes.byteOffset + outcome.bytes.byteLength)
    );
    expect(reparsed.images[0]?.decorative).toBe(true);

    const audit = runAudit(reparsed);
    expect(audit.findings.filter((finding) => finding.ruleId === 'IMG-001')).toEqual([]);
  });

  it('extends an existing structure tree on a second pass without breaking the first', async () => {
    const sourceBytes = await createPdfWithImages(2);
    const parsed = await parsePdfBytes(sourceBytes.slice(0));
    const counts = pageImageCounts(parsed);

    const firstPass = await applyManualAltText(
      sourceBytes,
      [{ imageId: parsed.images[0]!.id, alt: 'First image description', decorative: false }],
      counts
    );
    expect(firstPass.skipped).toEqual([]);

    const secondPass = await applyManualAltText(
      firstPass.bytes.buffer.slice(firstPass.bytes.byteOffset, firstPass.bytes.byteOffset + firstPass.bytes.byteLength),
      [{ imageId: parsed.images[1]!.id, alt: 'Second image description', decorative: false }],
      counts
    );
    expect(secondPass.skipped).toEqual([]);

    const reparsed = await parsePdfBytes(
      secondPass.bytes.buffer.slice(secondPass.bytes.byteOffset, secondPass.bytes.byteOffset + secondPass.bytes.byteLength)
    );
    const altTexts = reparsed.tags.filter((tag) => tag.type === 'Figure' && tag.alt).map((tag) => tag.alt);
    expect(altTexts).toContain('First image description');
    expect(altTexts).toContain('Second image description');
  });

  it('credits Figure alt text by marked-content id when only some page images have alt text', async () => {
    const sourceBytes = await createPdfWithImages(2);
    const parsed = await parsePdfBytes(sourceBytes.slice(0));
    expect(parsed.images).toHaveLength(2);

    const outcome = await applyManualAltText(
      sourceBytes,
      [{ imageId: parsed.images[0]!.id, alt: 'First image description', decorative: false }],
      pageImageCounts(parsed)
    );
    expect(outcome.skipped).toEqual([]);

    const reparsed = await parsePdfBytes(
      outcome.bytes.buffer.slice(outcome.bytes.byteOffset, outcome.bytes.byteOffset + outcome.bytes.byteLength)
    );

    expect(reparsed.tags.filter((tag) => tag.type === 'Figure' && tag.alt)).toMatchObject([
      { alt: 'First image description', markedContentId: expect.any(Number) }
    ]);
    expect(reparsed.images[0]?.alt).toBe('First image description');
    expect(reparsed.images[1]?.alt).toBeUndefined();
  });

  it('skips pages whose painted images cannot be matched safely', async () => {
    const sourceBytes = await createPdfWithImages(1);
    const parsed = await parsePdfBytes(sourceBytes.slice(0));

    const outcome = await applyManualAltText(
      sourceBytes,
      [{ imageId: parsed.images[0]!.id, alt: 'Should be skipped', decorative: false }],
      // Claim the page has more images than the content stream shows.
      { 1: 5 }
    );

    expect(outcome.applied).toEqual([]);
    expect(outcome.skipped).toHaveLength(1);
    expect(outcome.skipped[0]?.reason).toMatch(/cannot match safely/i);
  });

  it('reports unknown image references instead of guessing', async () => {
    const sourceBytes = await createPdfWithImages(1);
    const outcome = await applyManualAltText(
      sourceBytes,
      [{ imageId: 'not-an-image-id', alt: 'Nope', decorative: false }],
      { 1: 1 }
    );
    expect(outcome.applied).toEqual([]);
    expect(outcome.skipped[0]?.reason).toMatch(/unrecognized/i);
  });
});
