import type { Metadata } from 'next';
import Link from 'next/link';
import { UPLOAD_PRIVACY_NOTE } from '@/lib/content/privacy';
import { RELEASE_NOTES } from '@/lib/content/release-notes';
import { SUPPORT } from '@/lib/content/support';

export const metadata: Metadata = {
  title: 'About'
};

const card = 'rounded-lg bg-white px-5 py-8 shadow-md sm:px-10 sm:py-10';
const linkClass = 'underline text-[var(--ucsd-blue)] hover:text-[var(--ucsd-navy)]';

export default function AboutPage() {
  const [latestRelease] = RELEASE_NOTES;

  return (
    <div className="space-y-8">
      <section className="rounded-lg border-t-4 border-t-[var(--ucsd-blue)] bg-white px-5 py-10 shadow-md sm:px-10 sm:py-12">
        <h1>About</h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-[var(--ucsd-text)]">
          PDF Remediator checks a PDF for common accessibility problems, fixes the ones it can safely fix, and gives
          you a checklist of what is left. It does a first pass for you. It does not replace a final check by a person,
          and some PDFs still need fixes in Word, PowerPoint or Acrobat.
        </p>
      </section>

      <section className={card}>
        <h2>2-Minute Quick Start</h2>
        <ol className="mt-4 max-w-3xl list-decimal space-y-3 pl-6 text-[var(--ucsd-text)]">
          <li>Go to the App page and upload your PDF.</li>
          <li>Wait for the check to finish (usually under a few minutes, depending on file size).</li>
          <li>Open the results. They show what we fixed and what is still left.</li>
          <li>Work through the checklist: describe images, mark decorative ones, and follow the steps for anything else.</li>
          <li>Download the updated PDF. Make any fixes the checklist asks for in Word, PowerPoint or Acrobat.</li>
          <li>Upload the revised PDF so we can check it again before you publish.</li>
        </ol>
      </section>

      <section className={card}>
        <h2>What This Tool Is Best For</h2>
        <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-6 text-[var(--ucsd-text)]">
          <li>A quick first pass on common PDF accessibility problems.</li>
          <li>Finding out what still needs a person before you publish.</li>
          <li>Writing image descriptions and adding them to the PDF.</li>
          <li>Knowing when to go back to the source file, or when to ask for help.</li>
        </ul>
      </section>

      <section className={card}>
        <h2>How To Read Your Results</h2>
        <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-6 text-[var(--ucsd-text)]">
          <li>
            <strong>Passed automated checks</strong> is the best result the app can give. No automated tool can
            confirm a PDF is fully accessible, so a person still needs to look it over before publishing.
          </li>
          <li>
            <strong>Not yet</strong> means there is still something to fix. The results page says what it is and how
            to fix it.
          </li>
          <li>
            <strong>Not confirmed</strong> means our final automated check could not run. Check the PDF in PAC or
            Acrobat before publishing.
          </li>
          <li>
            If the app could not add the hidden structure (tags) that screen readers need, the best fix is usually to
            export the PDF again from the source file with tagging turned on.
          </li>
        </ul>
      </section>

      <section className={card}>
        <h2>What You Should Still Review Yourself</h2>
        <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-6 text-[var(--ucsd-text)]">
          <li>Heading order and structure in long or complex files.</li>
          <li>Table headers, merged cells and reading order in complex tables.</li>
          <li>Whether image descriptions for charts, diagrams and instructional images say what matters.</li>
          <li>Color contrast and anything that relies on color or position alone.</li>
          <li>How the PDF works with a screen reader, before publishing.</li>
        </ul>
      </section>

      <section className={card}>
        <h2>Getting Help</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-[var(--ucsd-text)]">
          If the app can&apos;t finish your PDF, the usual fix is to correct the source file (Word, PowerPoint, Google
          Docs) and export it again as a tagged PDF. If that isn&apos;t possible, ask{' '}
          <a href={SUPPORT.help.url} className={linkClass}>
            {SUPPORT.help.name}
          </a>{' '}
          for help. Include the PDF and a screenshot of the results page.
        </p>
      </section>

      <section className={card}>
        <h2>Privacy</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-[var(--ucsd-text)]">{UPLOAD_PRIVACY_NOTE}</p>
        <ul className="mt-3 max-w-3xl list-disc space-y-2 pl-6 text-[var(--ucsd-text)]">
          <li>The app does not keep your files on a server. Files and your progress are saved in this browser so you can come back to them.</li>
          <li>When you download the updated PDF, it is saved to your device.</li>
        </ul>
      </section>

      <section className={card}>
        <h2>Limitations</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-[var(--ucsd-text)]">
          Automatic fixes solve many common problems, but they don&apos;t guarantee that a PDF meets WCAG or PDF/UA.
          Some checks are best-effort only, especially color contrast, infographics and complex tables, and many
          files still need manual edits. Image descriptions are added to the PDF only when the app can match every
          saved description to the right image.
        </p>
      </section>

      <section className={card} aria-labelledby="for-accessibility-staff">
        <h2 id="for-accessibility-staff">For accessibility staff</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-[var(--ucsd-text)]">
          Technical detail on what the app does. Each result also has a technical report, linked from the bottom of
          its results page.
        </p>

        <h3 className="mt-6 text-xl font-semibold text-[var(--ucsd-navy)]">Processing steps</h3>
        <ol className="mt-3 max-w-3xl list-decimal space-y-3 pl-6 text-[var(--ucsd-text)]">
          <li>
            <strong>Parse</strong> &mdash; reads text, headings, links, forms, images, metadata and the tag tree in the
            browser with pdf.js.
          </li>
          <li>
            <strong>OCR</strong> &mdash; for image-only PDFs, rendered page images go to TritonAI through{' '}
            <code>/api/ocr/tritonai</code> (LiteLLM gateway; on-prem LightOn OCR first, then Mistral Small and Gemma
            fallbacks). Local Tesseract OCR runs in the browser if those don&apos;t return usable text. A PDF-native OCR
            backend can also be configured behind <code>/api/ocr</code>.
          </li>
          <li>
            <strong>Audit</strong> &mdash; internal rules for document structure, headings, images, tables, lists,
            links, forms, metadata and color. Rules that can&apos;t be evaluated (for example contrast when no text
            colors are extracted) are reported as not checked, and block the top result.
          </li>
          <li>
            <strong>Remediate</strong> &mdash; writes language, PDF/UA identifier, bookmarks, link text, form tooltips
            and tab order, and builds a tag tree bound to marked content (MCIDs and ParentTree) when it can.
          </li>
          <li>
            <strong>Re-audit and verify</strong> &mdash; runs the audit again and, when enabled, sends the updated PDF
            to veraPDF through <code>/api/verapdf</code> for a PDF/UA check.
          </li>
        </ol>

        <h3 className="mt-6 text-xl font-semibold text-[var(--ucsd-navy)]">Remediation modes</h3>
        <ul className="mt-3 max-w-3xl list-disc space-y-2 pl-6 text-[var(--ucsd-text)]">
          <li>
            <strong>Content-bound</strong>: the tag tree is bound to page content through MCIDs and ParentTree
            entries.
          </li>
          <li>
            <strong>Analysis-only</strong>: binding could not be verified, so the output is treated as untagged and
            the checklist requires manual tagging. The score is capped and the result can&apos;t pass.
          </li>
        </ul>

        <h3 className="mt-6 text-xl font-semibold text-[var(--ucsd-navy)]">Image descriptions</h3>
        <ul className="mt-3 max-w-3xl list-disc space-y-2 pl-6 text-[var(--ucsd-text)]">
          <li>
            Suggestions come from TritonAI through <code>/api/alt-text</code>; the cropped image region is sent, and
            the reviewer approves or edits the text.
          </li>
          <li>
            Saved descriptions are embedded as Figure <code>/Alt</code> bound by MCID; decorative images become
            artifacts. The download is all-or-nothing: if any saved description can&apos;t be matched, no partial PDF
            is produced.
          </li>
          <li>
            Images painted through nested graphics or Form XObjects may not be bindable and still need Acrobat or PAC.
          </li>
          <li>On re-upload, existing Figure alt text is recognized by marked-content ID.</li>
        </ul>
      </section>

      <section className={card}>
        <h2>Release Notes</h2>
        {latestRelease ? (
          <details className="mt-4 max-w-4xl">
            <summary className="cursor-pointer text-[var(--ucsd-text)]">
              <span className="font-semibold text-[var(--ucsd-navy)]">
                Latest: {latestRelease.versionLabel} ({latestRelease.deployedOn})
              </span>
              {latestRelease.summary ? <span className="mt-1 block text-sm">{latestRelease.summary}</span> : null}
              <span className="mt-1 block text-sm text-[var(--ucsd-blue)] underline">Show all release notes</span>
            </summary>
            <div className="mt-5 space-y-4">
              {RELEASE_NOTES.map((release) => (
                <article key={release.id} className="rounded-md border border-slate-200 bg-slate-50 px-5 py-4">
                  <h3 className="text-sm font-semibold text-[var(--ucsd-navy)]">
                    {release.versionLabel}{' '}
                    <span className="font-normal text-[var(--ucsd-text)]">({release.deployedOn})</span>
                  </h3>
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
          </details>
        ) : null}
      </section>

      <div className="pb-4">
        <Link
          href="/app"
          className="inline-flex items-center gap-2 rounded-md bg-[var(--ucsd-blue)] px-5 py-2.5 text-base font-medium text-white transition hover:bg-[var(--ucsd-navy)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ucsd-gold)] focus-visible:ring-offset-2"
        >
          Upload a PDF
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638l-3.96-3.96a.75.75 0 1 1 1.06-1.06l5.25 5.25a.75.75 0 0 1 0 1.06l-5.25 5.25a.75.75 0 1 1-1.06-1.06l3.96-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
