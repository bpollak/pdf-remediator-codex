import Link from 'next/link';

export function Header() {
  return (
    <header className="border-b border-[rgba(24,43,73,0.2)] bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <div>
          <Link href="/" className="text-lg font-bold tracking-tight text-[var(--ucsd-navy)]">
            UC San Diego Accessible PDF
          </Link>
          <p className="text-xs text-[var(--ucsd-blue)]">Web and digital accessibility workflow</p>
        </div>
        <a
          href="https://www.ucsd.edu"
          className="block w-[170px] min-w-[125px]"
          aria-label="Visit UC San Diego website"
        >
          <img
            src="https://brand.ucsd.edu/_images/logos/primary-campus-logo/logo-components-full.svg"
            alt="UC San Diego"
            className="h-auto w-full"
          />
        </a>
      </div>
      <div className="h-1 bg-[var(--ucsd-gold)]" />
      <nav className="bg-[var(--ucsd-blue)] text-sm font-medium text-white">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2">
          <Link href="/" className="rounded px-2 py-1 text-white transition hover:bg-[rgba(255,255,255,0.18)] hover:text-white">
            Home
          </Link>
          <Link href="/app" className="rounded px-2 py-1 text-white transition hover:bg-[rgba(255,255,255,0.18)] hover:text-white">
            App
          </Link>
        </div>
      </nav>
    </header>
  );
}
