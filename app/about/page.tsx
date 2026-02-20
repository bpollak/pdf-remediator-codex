import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="space-y-8">
      <section className="rounded-lg border-t-4 border-t-[var(--ucsd-blue)] bg-white px-10 py-12 shadow-md">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--ucsd-navy)]">About</h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-gray-700">
          UC San Diego Accessible PDF is a free, browser-based tool that audits PDF documents against WCAG&nbsp;2.1
          Level&nbsp;AA guidelines and automatically remediates common accessibility issues.
        </p>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2 className="text-2xl font-bold text-[var(--ucsd-navy)]">What It Does</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-gray-700">
          Upload a PDF and the tool runs a multi-step pipeline entirely in your browser:
        </p>
        <ol className="mt-4 max-w-3xl list-decimal space-y-3 pl-6 text-gray-700">
          <li>
            <strong>Parse</strong> &mdash; Extracts text, images, links, form fields, bookmarks, and existing tags from
            the PDF.
          </li>
          <li>
            <strong>OCR</strong> &mdash; Detects scanned or image-only pages and applies optical character recognition so
            the text becomes searchable and readable by assistive technology.
          </li>
          <li>
            <strong>Audit</strong> &mdash; Evaluates the document against accessibility rules covering structure, headings,
            images, tables, lists, links, color contrast, forms, and metadata. Each finding maps to a specific WCAG
            criterion.
          </li>
          <li>
            <strong>Remediate</strong> &mdash; Generates a new PDF with a proper tagged structure tree, semantic headings,
            lists, tables, document language, bookmarks, improved link text, form labels, and alt text for images.
          </li>
          <li>
            <strong>Re-audit</strong> &mdash; Runs the same rules against the remediated document so you can see exactly
            what improved.
          </li>
        </ol>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2 className="text-2xl font-bold text-[var(--ucsd-navy)]">Accessibility Features Applied</h2>
        <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-6 text-gray-700">
          <li>Tagged PDF structure tree with headings (H1&ndash;H6), paragraphs, lists, and tables</li>
          <li>Document sections that enable screen reader section navigation</li>
          <li>Document language set for correct speech synthesis</li>
          <li>Alt text for images, preferring captions when available</li>
          <li>Bookmarks generated from document headings</li>
          <li>Generic link text (e.g. &ldquo;click here&rdquo;) replaced with descriptive text</li>
          <li>Form field labels generated from field names</li>
          <li>PDF/UA compliance metadata</li>
          <li>Searchable text layer for scanned documents via OCR</li>
          <li>Multi-column reading order correction</li>
          <li>Repeating headers, footers, and page numbers identified as artifacts</li>
        </ul>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2 className="text-2xl font-bold text-[var(--ucsd-navy)]">Privacy</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-gray-700">
          All processing happens locally in your browser. Your PDF files are never uploaded to a server unless you have
          configured an external OCR service. Files stay on your device and are discarded when you close the page.
        </p>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2 className="text-2xl font-bold text-[var(--ucsd-navy)]">Limitations</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-gray-700">
          Automated remediation addresses many common issues but cannot replace a full manual accessibility review.
          Complex documents with intricate layouts, forms, or visual-only information may require additional attention.
          Always verify the remediated output with assistive technology and a PDF accessibility checker such as PAC.
        </p>
      </section>

      <div className="pb-4">
        <Link
          href="/app"
          className="inline-flex items-center gap-2 rounded-md bg-[var(--ucsd-blue)] px-5 py-2.5 text-base font-medium text-white transition hover:bg-[var(--ucsd-navy)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ucsd-gold)] focus-visible:ring-offset-2"
        >
          Start remediating
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638l-3.96-3.96a.75.75 0 1 1 1.06-1.06l5.25 5.25a.75.75 0 0 1 0 1.06l-5.25 5.25a.75.75 0 1 1-1.06-1.06l3.96-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
