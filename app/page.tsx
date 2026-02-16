import Link from 'next/link';

export default function LandingPage() {
  return (
    <section className="space-y-6 rounded-lg border border-[rgba(24,43,73,0.2)] bg-white p-8 shadow-sm">
      <h1 className="text-4xl font-bold tracking-tight text-[var(--ucsd-navy)]">UC San Diego Accessible PDF</h1>
      <p className="max-w-3xl text-lg text-[var(--ucsd-blue)]">
        Upload PDFs, run a deterministic WCAG 2.1 AA audit, and generate a remediated PDF directly in your browser.
      </p>
      <p className="max-w-3xl text-base text-[var(--ucsd-navy)]">
        This tool performs automated structural remediation. Manual review is still recommended for full WCAG 2.1 AA
        compliance.
      </p>
      <Link
        href="/app"
        className="inline-flex rounded bg-[var(--ucsd-blue)] px-4 py-2 font-medium text-white transition hover:bg-[var(--ucsd-navy)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ucsd-gold)] focus-visible:ring-offset-2"
      >
        Open app
      </Link>
    </section>
  );
}
