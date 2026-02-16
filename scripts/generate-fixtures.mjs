import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFile } from "node:fs/promises";

async function createAccessible() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  pdf.setTitle("Accessible Fixture Document");
  pdf.setAuthor("AccessiblePDF Tests");
  pdf.setSubject("Fully populated metadata fixture");
  pdf.setKeywords(["wcag", "accessible", "fixture", "pdfuaid:1"]);
  pdf.setLanguage("en-US");

  for (let pageIndex = 0; pageIndex < 5; pageIndex += 1) {
    const page = pdf.addPage([612, 792]);
    page.drawText(`Section ${pageIndex + 1}`, {
      x: 72,
      y: 730,
      size: 22,
      font: bold,
      color: rgb(0.05, 0.19, 0.58)
    });

    page.drawText(
      "This fixture includes headings, body text, links, and metadata for parser and audit regression tests.",
      {
        x: 72,
        y: 690,
        size: 12,
        font,
        color: rgb(0, 0, 0)
      }
    );

    page.drawText("1. First bullet item", { x: 90, y: 650, size: 12, font });
    page.drawText("2. Second bullet item", { x: 90, y: 630, size: 12, font });

    page.drawText("Visit docs at https://example.com/docs", {
      x: 72,
      y: 590,
      size: 12,
      font,
      color: rgb(0, 0.2, 0.65)
    });

    page.drawText("Column A   Column B", { x: 72, y: 550, size: 12, font: bold });
    page.drawText("Value 1    Value 2", { x: 72, y: 530, size: 12, font });
  }

  const bytes = await pdf.save();
  await writeFile("fixtures/accessible.pdf", bytes);
}

async function createUntagged() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);

  const page = pdf.addPage([612, 792]);
  page.drawText("simple untagged document", { x: 72, y: 720, size: 12, font });
  page.drawText("- item one", { x: 72, y: 690, size: 12, font });
  page.drawText("- item two", { x: 72, y: 670, size: 12, font });

  const bytes = await pdf.save();
  await writeFile("fixtures/untagged.pdf", bytes);
}

async function createPartial() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  pdf.setTitle("Partial Accessibility Fixture");

  const page1 = pdf.addPage([612, 792]);
  page1.drawText("Heading 1", { x: 72, y: 730, size: 24, font: bold });
  page1.drawText("Heading 3 (skipped level)", { x: 72, y: 690, size: 18, font: bold });
  page1.drawText("click here", { x: 72, y: 650, size: 12, font, color: rgb(0, 0.1, 0.6) });
  page1.drawText("click here", { x: 72, y: 630, size: 12, font, color: rgb(0, 0, 0) });

  const page2 = pdf.addPage([612, 792]);
  page2.drawText("Table", { x: 72, y: 730, size: 14, font: bold });
  page2.drawText("A   B", { x: 72, y: 700, size: 12, font: bold });
  page2.drawText("1   2", { x: 72, y: 680, size: 12, font });

  const page3 = pdf.addPage([612, 792]);
  page3.drawText("IMG_2034.jpg", { x: 72, y: 700, size: 12, font });

  const bytes = await pdf.save();
  await writeFile("fixtures/partial.pdf", bytes);
}

await Promise.all([createAccessible(), createUntagged(), createPartial()]);
