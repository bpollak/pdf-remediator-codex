import Link from 'next/link';

type InternalNavItem = {
  label: string;
  href: '/' | '/app';
  hasChevron: boolean;
  external: false;
};

type ExternalNavItem = {
  label: string;
  href: string;
  hasChevron: boolean;
  external: true;
};

const navItems: (InternalNavItem | ExternalNavItem)[] = [
  { label: 'Home', href: '/', hasChevron: false, external: false },
  { label: 'Upload and Compare', href: '/app', hasChevron: true, external: false },
  {
    label: 'Brand Guidelines',
    href: 'https://brand.ucsd.edu/using-the-brand/web-and-digital/index.html',
    hasChevron: true,
    external: true
  },
  {
    label: 'Logos',
    href: 'https://brand.ucsd.edu/logos-and-brand-elements/logos.html',
    hasChevron: true,
    external: true
  },
  { label: 'Contact', href: 'https://www.ucsd.edu', hasChevron: false, external: true }
];

export function Header() {
  return (
    <header className="border-b border-[rgba(24,43,73,0.2)] bg-[#ececec]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
        <Link
          href="/"
          className="inline-block text-[clamp(1rem,2.2vw,2rem)] font-medium uppercase tracking-[0.12em] text-black"
          style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}
        >
          Accessble PDF Creator
        </Link>
        <a
          href="https://www.ucsd.edu"
          className="block w-[220px] min-w-[160px] sm:w-[280px]"
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
        <div className="mx-auto w-full max-w-6xl overflow-x-auto px-2">
          <div className="flex min-w-max items-center gap-2 whitespace-nowrap py-2 sm:gap-5 sm:py-3">
            {navItems.map((item) => {
              const content = (
                <span className="inline-flex items-center gap-2 rounded px-3 py-1 text-base font-medium text-white transition hover:bg-[rgba(255,255,255,0.16)] sm:text-[1.05rem]">
                  {item.label}
                  {item.hasChevron ? <span className="text-xs leading-none text-white/95">▼</span> : null}
                </span>
              );

              return item.external ? (
                <a key={item.label} href={item.href} target="_blank" rel="noreferrer">
                  {content}
                </a>
              ) : (
                <Link key={item.label} href={item.href}>
                  {content}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </header>
  );
}
