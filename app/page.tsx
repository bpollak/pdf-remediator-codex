import Link from 'next/link';

export default function LandingPage() {
  return (
    <section className="space-y-6">
      <h1 className="text-4xl font-bold">AccessiblePDF</h1>
      <p className="max-w-3xl text-lg text-slate-700 dark:text-slate-300">
        Upload PDFs, run a deterministic WCAG 2.1 AA audit, and generate a remediated PDF directly in your browser.
      </p>
      <Link href="/app" className="inline-flex rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500">
        Open app
      </Link>
    </section>
  );
}
