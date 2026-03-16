import Link from 'next/link';

const steps = [
  {
    number: '1',
    title: 'Upload',
    description: 'Drop your PDF into the browser. No software to install.',
  },
  {
    number: '2',
    title: 'Auto-fix',
    description: 'The app finds common issues and fixes what it can automatically.',
  },
  {
    number: '3',
    title: 'Review',
    description: 'See what was fixed and what still needs your attention.',
  },
  {
    number: '4',
    title: 'Publish',
    description: 'Download your improved PDF and a checklist of any remaining items.',
  },
];

export default function LandingPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-5 rounded-lg border-t-4 border-t-[var(--ucsd-blue)] bg-white px-10 py-12 shadow-md">
        <h1>Make Your PDF More Accessible</h1>
        <p className="max-w-3xl text-lg leading-relaxed text-[var(--ucsd-text)]">
          Accessible PDFs work for everyone — including people who use screen readers, keyboard navigation, or other assistive tools. Upload your PDF and this app will check for common issues, fix what it can, and show you what to do next.
        </p>
        <p className="max-w-3xl text-base leading-relaxed text-[var(--ucsd-text)]">
          Most PDFs are processed in under a minute. No accessibility expertise required.
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

      {/* How it works */}
      <section className="rounded-lg bg-white px-10 py-8 shadow-md">
        <h2 className="text-xl font-semibold text-[var(--ucsd-navy)]">How it works</h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <li key={step.number} className="rounded border border-[rgba(24,43,73,0.12)] bg-slate-50 p-4">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ucsd-blue)] text-sm font-bold text-white">
                {step.number}
              </span>
              <p className="mt-2 text-base font-semibold text-[var(--ucsd-navy)]">{step.title}</p>
              <p className="mt-1 text-sm text-[var(--ucsd-text)]">{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* What you'll need */}
      <section className="rounded-lg bg-white px-10 py-8 shadow-md">
        <h2 className="text-xl font-semibold text-[var(--ucsd-navy)]">What you&apos;ll need</h2>
        <ul className="mt-4 space-y-2 text-sm text-[var(--ucsd-text)]">
          <li className="flex items-start gap-2">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-green-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
            </svg>
            <span>A PDF file you want to make accessible (up to 50 MB)</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-green-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
            </svg>
            <span>A modern web browser — everything runs in your browser, nothing is uploaded to a server</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ucsd-blue)]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
            </svg>
            <span>For some manual fixes, you may need Adobe Acrobat Pro or the free <a href="https://pac.pdf-accessibility.org/" target="_blank" rel="noreferrer" className="underline text-[var(--ucsd-blue)] hover:text-[var(--ucsd-navy)]">PAC tool</a> — the app will tell you when</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
