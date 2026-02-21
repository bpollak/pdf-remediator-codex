import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="space-y-8">
      <section className="rounded-lg border-t-4 border-t-[var(--ucsd-blue)] bg-white px-10 py-12 shadow-md">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--ucsd-navy)]">About</h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-gray-700">
          UC San Diego Accessible PDF is a free, browser-first tool that runs rule-based accessibility checks aligned to
          WCAG&nbsp;2.1 AA criteria and applies automated remediation for common PDF issues.
        </p>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2 className="text-2xl font-bold text-[var(--ucsd-navy)]">What It Does</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-gray-700">
          Upload a PDF and the tool runs a multi-step pipeline. Most steps run in your browser, and optional OCR and
          verification services can be configured:
        </p>
        <ol className="mt-4 max-w-3xl list-decimal space-y-3 pl-6 text-gray-700">
          <li>
            <strong>Parse</strong> &mdash; Extracts text, links, form fields, bookmarks/outlines, existing tags, and
            metadata from the PDF.
          </li>
          <li>
            <strong>OCR</strong> &mdash; For likely scanned or image-only files, the app first tries a configured OCR
            API and falls back to local in-browser OCR when needed.
          </li>
          <li>
            <strong>Audit</strong> &mdash; Evaluates the document against accessibility rules covering structure, headings,
            images, tables, lists, links, color/visual checks, forms, and metadata/navigation. Findings map to specific
            WCAG criteria used by this ruleset.
          </li>
          <li>
            <strong>Remediate</strong> &mdash; Generates a remediated PDF with injected structure tags, document
            language, PDF/UA metadata, normalized link text, generated form labels, outlines, and heuristic
            heading/list/table structure.
          </li>
          <li>
            <strong>Re-audit</strong> &mdash; Runs the same rules against the remediated document so you can see exactly
            what improved.
          </li>
          <li>
            <strong>Verify (optional)</strong> &mdash; If configured, sends the remediated PDF through <code>/api/verapdf</code>{' '}
            to a veraPDF REST backend for an external PDF/UA compliance check.
          </li>
        </ol>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2 className="text-2xl font-bold text-[var(--ucsd-navy)]">Accessibility Features Applied</h2>
        <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-6 text-gray-700">
          <li>StructTreeRoot and semantic tags (Document, Sect, H1&ndash;H6, P, L/LI, Table/TR/TH/TD)</li>
          <li>Document language and metadata updates, including PDF/UA identifier metadata</li>
          <li>Bookmarks/outlines preserved or generated from detected headings</li>
          <li>Generic link text (e.g. &ldquo;click here&rdquo;) rewritten to more descriptive text</li>
          <li>Form field labels inferred from field names when labels are missing</li>
          <li>Heuristic alt text generation when image metadata is available</li>
          <li>Searchable OCR text support for scanned documents (service or local fallback)</li>
          <li>Heuristic multi-column reading-order reordering during remediation planning</li>
          <li>Post-remediation re-audit and before/after comparison workflow</li>
        </ul>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2 className="text-2xl font-bold text-[var(--ucsd-navy)]">Privacy</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-gray-700">
          Processing is browser-first. If a file appears scanned and <code>OCR_SERVICE_URL</code> is configured, the
          file is sent through <code>/api/ocr</code> to your OCR backend. If no backend is available, local OCR fallback
          runs in the browser. If <code>VERAPDF_SERVICE_URL</code> is configured, remediated output can be sent through{' '}
          <code>/api/verapdf</code> for external verification. Outside configured OCR and verification requests, files stay
          on your device and are discarded when you close the page.
        </p>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2 className="text-2xl font-bold text-[var(--ucsd-navy)]">Limitations</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-gray-700">
          Automated remediation addresses many common issues but does not provide full WCAG or PDF/UA certification.
          Several checks are heuristic or advisory (especially color contrast and complex layout interpretation), and
          some documents need manual fixes. veraPDF REST adds useful automated verification when configured, but you
          should still validate output with assistive technology and manual review.
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
