import Link from 'next/link';
import { RELEASE_NOTES } from '@/lib/content/release-notes';

export default function AboutPage() {
  return (
    <div className="space-y-8">
      <section className="rounded-lg border-t-4 border-t-[var(--ucsd-blue)] bg-white px-10 py-12 shadow-md">
        <h1>About</h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-[var(--ucsd-text)]">
          PDF Remediator is an assisted accessibility remediation copilot. Upload a PDF to get an automated first pass,
          clear remediation-mode labeling (<em>content-bound</em> vs <em>analysis-only</em>), and guided next steps
          for final manual validation before publishing.
        </p>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2>Release Notes</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-[var(--ucsd-text)]">
          Updated with each deployment to summarize shipped enhancements and quality improvements. The newest
          entry reflects what is in the current build.
        </p>
        <div className="mt-5 max-w-4xl space-y-4">
          {RELEASE_NOTES.map((release) => (
            <article key={release.id} className="rounded-md border border-slate-200 bg-slate-50 px-5 py-4">
              <p className="text-sm font-semibold text-[var(--ucsd-navy)]">
                {release.versionLabel}{' '}
                <span className="font-normal text-[var(--ucsd-text)]">({release.deployedOn})</span>
              </p>
              {release.summary ? (
                <p className="mt-2 text-sm leading-relaxed text-[var(--ucsd-text)]">{release.summary}</p>
              ) : null}
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--ucsd-text)]">
                {release.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
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
          <li>Reducing remediation effort while keeping humans in control of final compliance decisions.</li>
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
            <strong>Fix what it can safely</strong> &mdash; Applies supported automatic fixes and builds an updated PDF.
          </li>
          <li>
            <strong>Check again and compare</strong> &mdash; Runs the checks again and shows before/after
            results side by side.
          </li>
          <li>
            <strong>Set remediation mode</strong> &mdash; Marks output as <em>content-bound</em> when structural bindings
            are reliable, or <em>analysis-only</em> when manual structural tagging is still required.
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
          <li>Preserves and evaluates document tag structure, then flags where manual tag repair is required.</li>
          <li>Detects unbound structure conditions and prevents those files from being treated as fully remediated.</li>
          <li>Updates language and file details used by accessibility tools.</li>
          <li>Keeps or creates bookmarks from detected headings when possible.</li>
          <li>Rewrites vague link text (like &ldquo;click here&rdquo;) to clearer wording.</li>
          <li>Adds missing form labels based on field names when possible.</li>
          <li>Detects real PDF image content from page rendering data and flags missing alt text.</li>
          <li>Stores compact immutable remediation metadata to improve repeat-run consistency.</li>
          <li>Adds searchable text support for scanned PDFs.</li>
          <li>Tries to improve reading order in some multi-column layouts.</li>
          <li>Checks the updated file again and shows a before/after comparison.</li>
        </ul>
      </section>

      <section className="rounded-lg bg-white px-10 py-10 shadow-md">
        <h2>How To Interpret Results</h2>
        <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-6 text-[var(--ucsd-text)]">
          <li><strong>Automated Check Score</strong> reflects this app&apos;s internal checks, not a legal/compliance guarantee.</li>
          <li><strong>veraPDF status</strong> is an independent external PDF/UA technical verification when enabled.</li>
          <li><strong>100%</strong> is only shown for remediated output when critical internal findings are clear and external verification is compliant.</li>
          <li><strong>Unbound structure detection</strong> applies a strict score ceiling and routes output to analysis-only mode.</li>
          <li><strong>Analysis-only mode</strong> means manual structural tagging remains required before release.</li>
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
          Some checks are best-effort only (especially color contrast, infographic layouts, and complex tables), and
          many files still need manual edits. If content-bound structural tagging cannot be verified, the output is
          treated as analysis-only. If veraPDF is enabled, it adds an independent technical check, but you should still
          complete manual review with desktop tools and assistive technology before publishing.
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
