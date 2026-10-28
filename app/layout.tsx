import './globals.css';
import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { RouteFocus } from '@/components/ux/RouteFocus';
import { SITE_TITLE } from '@/lib/content/site';

export const metadata: Metadata = {
  title: {
    default: SITE_TITLE,
    template: `%s – ${SITE_TITLE}`
  },
  description:
    'Check a PDF for common accessibility problems, fix what can be fixed automatically, and see what still needs a person.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <Header />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          {children}
        </main>
        <Footer />
        <RouteFocus />
      </body>
    </html>
  );
}
