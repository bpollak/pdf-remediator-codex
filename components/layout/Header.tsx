import Link from 'next/link';

export function Header() {
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <nav className="mx-auto flex max-w-6xl items-center justify-between p-4">
        <Link href="/" className="font-semibold">AccessiblePDF</Link>
        <div className="space-x-3 text-sm">
          <Link href="/app" className="hover:underline">App</Link>
        </div>
      </nav>
    </header>
  );
}
