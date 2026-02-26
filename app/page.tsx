import Link from 'next/link';

export default function LandingPage() {
  return (
    <section className="space-y-5 rounded-lg border-t-4 border-t-[var(--ucsd-blue)] bg-white px-10 py-12 shadow-md">
      <h1>Make Your PDF More Accessible</h1>
      <p className="max-w-3xl text-lg leading-relaxed text-[var(--ucsd-text)]">
        Upload your PDF. We check common accessibility issues and generate an improved version in your browser.
      </p>
      <p className="max-w-3xl text-base leading-relaxed text-[var(--ucsd-text)]">
        You will get three things: an updated PDF, a summary of what changed, and a clear list of manual follow-up steps.
      </p>
      <Link
        href="/app"
        className="inline-flex items-center gap-2 rounded-md bg-[var(--ucsd-blue)] px-5 py-2.5 text-base font-medium text-white transition hover:bg-[var(--ucsd-navy)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ucsd-gold)] focus-visible:ring-offset-2"
      >
        Start accessibility check
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638l-3.96-3.96a.75.75 0 1 1 1.06-1.06l5.25 5.25a.75.75 0 0 1 0 1.06l-5.25 5.25a.75.75 0 1 1-1.06-1.06l3.96-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
        </svg>
      </Link>
    </section>
  );
}
