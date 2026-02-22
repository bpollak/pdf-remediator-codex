import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="space-y-8">
      <section className="rounded-lg border-t-4 border-t-[var(--ucsd-blue)] bg-white px-10 py-12 shadow-md">
        <h1>About</h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-[var(--ucsd-text)]">
          UC San Diego Accessible PDF helps you make documents easier to use with screen readers and keyboards. Upload
          a PDF, get an improved version, then follow a short checklist for anything that still needs manual edits.
        </p>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2>2-Minute Quick Start</h2>
        <ol className="mt-4 max-w-3xl list-decimal space-y-3 pl-6 text-[var(--ucsd-text)]">
          <li>Go to the App page and upload your PDF.</li>
          <li>Wait for the review to finish (usually under a few minutes, depending on file size).</li>
          <li>Download the remediated PDF.</li>
          <li>Use the &ldquo;What To Do Next&rdquo; checklist to complete remaining manual fixes.</li>
          <li>Re-upload the revised PDF for a final validation check before publishing.</li>
        </ol>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2>What This Tool Is Best For</h2>
        <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-6 text-[var(--ucsd-text)]">
          <li>Fast first-pass remediation of common PDF accessibility issues.</li>
          <li>Identifying where manual edits are still required before publication.</li>
          <li>Comparing before/after results so teams can quickly review progress.</li>
        </ul>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2>What Happens After You Upload</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-[var(--ucsd-text)]">
          The app runs a step-by-step workflow and shows progress as each phase completes:
        </p>
        <ol className="mt-4 max-w-3xl list-decimal space-y-3 pl-6 text-[var(--ucsd-text)]">
          <li>
            <strong>Read the file</strong> &mdash; Reviews text, headings, links, forms, and metadata.
          </li>
          <li>
            <strong>Read scanned pages</strong> &mdash; If the PDF is image-based, OCR is used to add searchable text.
          </li>
          <li>
            <strong>Check for issues</strong> &mdash; Looks for common problems in headings, images, tables, lists,
            links, and form fields.
          </li>
          <li>
            <strong>Fix what it can</strong> &mdash; Makes supported automatic fixes and builds an updated PDF.
          </li>
          <li>
            <strong>Check again and compare</strong> &mdash; Runs the checks again and shows before/after
            results side by side.
          </li>
          <li>
            <strong>Optional standards check</strong> &mdash; If veraPDF is enabled in your environment, the app runs an
            additional standards check.
          </li>
          <li>
            <strong>Next steps</strong> &mdash; Produces a practical checklist of remaining manual fixes.
          </li>
        </ol>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2>Accessibility Features Applied</h2>
        <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-6 text-[var(--ucsd-text)]">
          <li>Adds and improves document tags so screen readers can better understand the PDF structure.</li>
          <li>Updates language and file details used by accessibility tools.</li>
          <li>Keeps or creates bookmarks from detected headings when possible.</li>
          <li>Rewrites vague link text (like &ldquo;click here&rdquo;) to clearer wording.</li>
          <li>Adds missing form labels based on field names when possible.</li>
          <li>Tries to create image alt text when useful image details are available.</li>
          <li>Adds searchable text support for scanned PDFs.</li>
          <li>Tries to improve reading order in some multi-column layouts.</li>
          <li>Checks the updated file again and shows a before/after comparison.</li>
        </ul>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2>What You Should Still Review Manually</h2>
        <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-6 text-[var(--ucsd-text)]">
          <li>Heading order and document structure in long or complex files.</li>
          <li>Table headers, merged cells, and reading order in complex tables.</li>
          <li>Meaningful alt text for charts, diagrams, and instructional images.</li>
          <li>Color contrast and visual-only cues that automated checks may miss.</li>
          <li>Final usability with assistive technology before publishing.</li>
        </ul>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2>Privacy</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-[var(--ucsd-text)]">
          Most processing happens in your browser. If OCR or veraPDF is enabled in your setup, the file may be sent to
          those services during processing. Otherwise, files stay on your device and are cleared when you close the
          page.
        </p>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2>Limitations</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-[var(--ucsd-text)]">
          Automatic fixes can solve many common issues, but they do not guarantee full WCAG or PDF/UA compliance.
          Some checks are best-effort only (especially color contrast and complex layouts), and many files still need
          manual edits. If veraPDF is enabled, it adds another helpful check, but you should still review the file with
          assistive technology and manual testing.
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
