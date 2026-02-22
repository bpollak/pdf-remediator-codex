import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="space-y-8">
      <section className="rounded-lg border-t-4 border-t-[var(--ucsd-blue)] bg-white px-10 py-12 shadow-md">
        <h1>About</h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-[var(--ucsd-text)]">
          UC San Diego Accessible PDF is a free tool you use in your web browser. It checks your PDF for common
          accessibility problems, fixes what it can automatically, and shows you what to fix by hand.
        </p>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2>2-Minute Quick Start</h2>
        <ol className="mt-4 max-w-3xl list-decimal space-y-3 pl-6 text-[var(--ucsd-text)]">
          <li>Upload your PDF on the App page.</li>
          <li>Wait while the app reviews the file and makes automatic fixes.</li>
          <li>Open the compare results and review the &ldquo;What To Do Next&rdquo; checklist.</li>
          <li>Download the updated PDF and complete any remaining manual fixes.</li>
          <li>Re-upload the revised file to confirm improvements before publishing.</li>
        </ol>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2>What It Does</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-[var(--ucsd-text)]">
          After you upload a file, the app follows a simple step-by-step process. Most of the work happens in your
          browser:
        </p>
        <ol className="mt-4 max-w-3xl list-decimal space-y-3 pl-6 text-[var(--ucsd-text)]">
          <li>
            <strong>Read the file</strong> &mdash; Looks at the text, headings, links, forms, and file details.
          </li>
          <li>
            <strong>Read scanned pages</strong> &mdash; If your PDF is a scan, the app tries to turn images of text into
            searchable text.
          </li>
          <li>
            <strong>Check for issues</strong> &mdash; Looks for common accessibility problems in headings, images,
            tables, lists, links, forms, and other parts of the file.
          </li>
          <li>
            <strong>Fix what it can</strong> &mdash; Makes supported automatic fixes and builds an updated PDF.
          </li>
          <li>
            <strong>Check again and compare</strong> &mdash; Runs the checks again and shows before/after
            results side by side.
          </li>
          <li>
            <strong>Optional standards check</strong> &mdash; If your setup includes veraPDF, the app can run an extra
            standards check on the updated file.
          </li>
          <li>
            <strong>Next steps</strong> &mdash; Gives you a clear checklist of what to fix manually before publishing.
          </li>
        </ol>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2>What You Can Expect During Review</h2>
        <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-6 text-[var(--ucsd-text)]">
          <li>The app may run more than one fixing pass to get better results before it shows you the final output.</li>
          <li>If a newer pass is worse, the app keeps the better version.</li>
          <li>You can watch progress in real time with clear status updates.</li>
          <li>Results are explained in plain language, including a practical &ldquo;What To Do Next&rdquo; checklist.</li>
          <li>Before/after comparisons and download actions are grouped together to support quick review decisions.</li>
        </ul>
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
        <h2>Privacy</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-[var(--ucsd-text)]">
          Most processing happens in your browser. If OCR or veraPDF validation is enabled, your file may be sent to
          those services during processing — both are hosted on UC San Diego servers and your document does not leave
          the university&apos;s infrastructure. Otherwise, files stay on your device and are cleared when you close the
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
