import Link from 'next/link';

export function Header() {
  return (
    <header className="ucsd-layout-header">
      <section aria-label="Site name" className="ucsd-layout-title">
        <div className="ucsd-layout-container ucsd-layout-title-row">
          <Link aria-label="PDF Remediator home" className="ucsd-title-header" href="/">
            PDF Remediator
          </Link>
          <a aria-label="Visit UC San Diego website" className="ucsd-title-logo" href="https://www.ucsd.edu">
            UC San Diego
          </a>
        </div>
      </section>
      <nav aria-label="Primary" className="ucsd-layout-navbar">
        <div className="ucsd-layout-container ucsd-navbar-row">
          <ul className="ucsd-navbar-list">
            <li>
              <Link className="ucsd-navbar-link" href="/">
                Home
              </Link>
            </li>
            <li>
              <Link className="ucsd-navbar-link" href="/app">
                App
              </Link>
            </li>
            <li>
              <Link className="ucsd-navbar-link" href="/about">
                About
              </Link>
            </li>
          </ul>
          <a aria-label="Visit UC San Diego website" className="ucsd-title-logo-mobile" href="https://www.ucsd.edu">
            UC San Diego
          </a>
        </div>
      </nav>
    </header>
  );
}
