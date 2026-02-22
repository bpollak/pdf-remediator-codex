import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="space-y-8">
      <section className="rounded-lg border-t-4 border-t-[var(--ucsd-blue)] bg-white px-10 py-12 shadow-md">
        <h1>About</h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-[var(--ucsd-text)]">
          UC San Diego Accessible PDF is a free, browser-first tool that checks your PDF for common accessibility
          problems, applies automatic fixes, and tells you what still needs manual review.
        </p>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2>2-Minute Quick Start</h2>
        <ol className="mt-4 max-w-3xl list-decimal space-y-3 pl-6 text-[var(--ucsd-text)]">
          <li>Upload your PDF on the App page.</li>
          <li>Wait while the app checks and fixes the file.</li>
          <li>Open the compare results and review the &ldquo;What To Do Next&rdquo; checklist.</li>
          <li>Download the updated PDF and complete any remaining manual fixes.</li>
          <li>Re-upload the revised file to confirm improvements before publishing.</li>
        </ol>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2>What It Does</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-[var(--ucsd-text)]">
          After upload, the app runs a step-by-step workflow. Most processing happens in your browser:
        </p>
        <ol className="mt-4 max-w-3xl list-decimal space-y-3 pl-6 text-[var(--ucsd-text)]">
          <li>
            <strong>Analyze</strong> &mdash; Reads document text, structure, links, forms, headings, and metadata.
          </li>
          <li>
            <strong>OCR when needed</strong> &mdash; If the file appears scanned, the app makes text searchable using a
            configured OCR service or local in-browser fallback.
          </li>
          <li>
            <strong>Audit</strong> &mdash; Checks for common accessibility issues across structure, headings, images,
            tables, lists, links, forms, and metadata.
          </li>
          <li>
            <strong>Auto-fix</strong> &mdash; Applies supported fixes and creates an updated PDF.
          </li>
          <li>
            <strong>Re-check and compare</strong> &mdash; Re-runs checks on the updated file and shows before/after
            results side by side.
          </li>
          <li>
            <strong>PDF/UA verification (optional)</strong> &mdash; If configured, sends the updated PDF to veraPDF for
            an independent PDF/UA check.
          </li>
          <li>
            <strong>Guided next steps</strong> &mdash; Provides a prioritized checklist so staff know what to fix
            manually before publishing.
          </li>
        </ol>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2>What You Can Expect During Review</h2>
        <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-6 text-[var(--ucsd-text)]">
          <li>The app may run multiple remediation passes to improve accessibility outcomes before presenting results.</li>
          <li>If a newer pass performs worse, the tool keeps the strongest result instead of overwriting it.</li>
          <li>You can follow progress in real time with clear status updates while processing is in progress.</li>
          <li>Results are explained in plain language, including a practical &ldquo;What To Do Next&rdquo; checklist.</li>
          <li>Before/after comparisons and download actions are grouped together to support quick review decisions.</li>
        </ul>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2>Accessibility Features Applied</h2>
        <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-6 text-[var(--ucsd-text)]">
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
        <h2>Privacy</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-[var(--ucsd-text)]">
          Processing is browser-first. If your environment is configured for OCR or veraPDF verification, files may be
          sent to those services during processing. Otherwise, files remain on your device and are cleared when you
          close the page.
        </p>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2>Limitations</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-[var(--ucsd-text)]">
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
