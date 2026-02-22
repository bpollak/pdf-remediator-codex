import './globals.css';
import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export const metadata: Metadata = {
  title: 'PDF Remediator',
  description: 'PDF Remediator offers client-side PDF accessibility remediation and reporting.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Header />
        <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
