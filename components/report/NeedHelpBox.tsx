import { SUPPORT } from '@/lib/content/support';

/** Shown on the results page whenever a fix has to be made outside the app. */
export function NeedHelpBox() {
  return (
    <section
      aria-labelledby="need-help-heading"
      className="rounded-lg border border-[rgba(0,98,155,0.3)] bg-[rgba(0,98,155,0.06)] p-5 shadow-sm"
    >
      <h2 id="need-help-heading">Need help?</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ucsd-text)]">
        Some fixes can&apos;t be made in this app. You have two options:
      </p>
      <ul className="mt-2 max-w-2xl list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--ucsd-text)]">
        <li>
          <span className="font-semibold">Fix the source file.</span> Open the original Word, PowerPoint or Google
          Docs file, make the fix there, and export it again as a PDF. This usually works best.
        </li>
        <li>
          <span className="font-semibold">Ask for help.</span>{' '}
          <a
            href={SUPPORT.help.url}
            className="font-semibold text-[var(--ucsd-blue)] underline hover:text-[var(--ucsd-navy)]"
          >
            Contact {SUPPORT.help.name}
          </a>
          . Include this PDF and a screenshot of this page.
        </li>
      </ul>
    </section>
  );
}
