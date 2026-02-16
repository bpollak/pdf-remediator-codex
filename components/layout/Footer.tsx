export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="ucsd-site-footer">
      <div className="ucsd-layout-container">
        <div className="ucsd-site-footer-row">
          <div className="ucsd-site-footer-left">
            <p>
              <span>UC San Diego 9500 Gilman Dr. La Jolla, CA 92093 (858) 534-2230</span>
              <br />
              <span>Copyright © {year} Regents of the University of California. All rights reserved.</span>
            </p>
            <ul className="ucsd-site-footer-links">
              <li>
                <a href="https://accessibility.ucsd.edu/">Accessibility</a>
              </li>
              <li>
                <a href="https://ucsd.edu/about/privacy.html">Privacy</a>
              </li>
              <li>
                <a href="https://ucsd.edu/about/terms-of-use.html">Terms of Use</a>
              </li>
              <li>
                <a href="mailto:brand@ucsd.edu">Feedback</a>
              </li>
            </ul>
          </div>
          <div className="ucsd-site-footer-right">
            <a href="https://ucsd.edu/">
              <img
                alt="UCSD homepage"
                className="ucsd-site-footer-logo"
                src="https://cdn.ucsd.edu/developer/decorator/5.0.2/img/ucsd-footer-logo-white.png"
              />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
