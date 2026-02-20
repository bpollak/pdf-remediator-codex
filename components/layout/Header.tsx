import Link from 'next/link';

export function Header() {
  return (
    <header className="ucsd-layout-header">
      <section aria-label="Site name" className="ucsd-layout-title">
        <div className="ucsd-layout-container ucsd-layout-title-row">
          <Link aria-label="UC San Diego Accessible PDF home" className="ucsd-title-header" href="/">
            UC San Diego Accessible PDF
          </Link>
          <a aria-label="Visit UC San Diego website" className="ucsd-title-logo" href="https://www.ucsd.edu">
            UC San Diego
          </a>
        </div>
      </section>
      <nav aria-label="Primary" className="ucsd-layout-navbar">
        <div className="ucsd-layout-container">
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
        </div>
      </nav>
    </header>
  );
}
