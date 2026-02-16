import Link from 'next/link';

export function Header() {
  return (
    <header className="border-b border-[rgba(24,43,73,0.2)] bg-[#ececec]">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-5 py-8 sm:px-6 sm:py-10">
        <Link
          href="/"
          className="inline-block text-[clamp(1.55rem,3vw,2.8rem)] font-medium uppercase tracking-[0.08em] text-black"
          style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}
        >
          Accessble PDF Creator
        </Link>
        <a
          href="https://www.ucsd.edu"
          className="block w-[220px] sm:w-[300px] md:w-[360px]"
          aria-label="Visit UC San Diego website"
        >
          <img
            src="https://brand.ucsd.edu/_images/logos/primary-campus-logo/logo-components-full.svg"
            alt="UC San Diego"
            className="h-auto w-full"
          />
        </a>
      </div>
      <nav className="bg-[var(--ucsd-blue)] text-white">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-7 px-5 py-3 sm:px-6 sm:py-4">
          <Link className="text-lg font-medium text-white transition hover:text-white/85" href="/">
            Home
          </Link>
          <Link className="text-lg font-medium text-white transition hover:text-white/85" href="/app">
            App
          </Link>
        </div>
      </nav>
    </header>
  );
}
