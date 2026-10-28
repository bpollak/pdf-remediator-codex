'use client';

import './globals.css';
import { ErrorFallback } from '@/components/app/ErrorFallback';

/** Replaces the root layout when it fails, so it renders its own html and body. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <main className="mx-auto w-full max-w-6xl px-6 py-8">
          <ErrorFallback error={error} reset={reset} title="PDF Remediator ran into a problem" />
        </main>
      </body>
    </html>
  );
}
