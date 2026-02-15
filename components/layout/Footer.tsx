export function Footer() {
  return (
    <footer className="mt-10 border-t border-[rgba(24,43,73,0.2)] bg-white">
      <div className="mx-auto w-full max-w-6xl px-6 pb-8 pt-5 text-sm text-[var(--ucsd-blue)]">
        <p className="font-semibold text-[var(--ucsd-navy)]">UC San Diego Accessible PDF</p>
        <p className="mt-1">
          This tool performs automated structural remediation. Manual review is still recommended for full WCAG 2.1 AA compliance.
        </p>
      </div>
    </footer>
  );
}
