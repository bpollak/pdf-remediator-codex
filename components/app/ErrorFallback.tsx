'use client';

import Link from 'next/link';
import { useEffect } from 'react';

interface ErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Heading level 1 when this replaces the whole page. */
  title?: string;
}

/**
 * Plain-language error screen for the route error boundaries. The error is
 * logged to the console for support; no message or stack is shown.
 */
export function ErrorFallback({ error, reset, title = 'Something went wrong on this page' }: ErrorFallbackProps) {
  useEffect(() => {
    console.error('[error-boundary]', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 rounded-lg border border-red-200 bg-white p-6 shadow-sm" role="alert">
      <h1 className="text-4xl">{title}</h1>
      <p className="text-[var(--ucsd-text)]">
        The page stopped working. Your files are still saved in this browser. Try again, or go back to the upload page.
        If this keeps happening with one PDF, remove it from the list or split it into smaller files.
      </p>
      {error.digest ? (
        <p className="text-xs text-[var(--ucsd-text)]">Reference for support: {error.digest}</p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-[var(--ucsd-blue)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--ucsd-navy)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ucsd-gold)] focus-visible:ring-offset-2"
        >
          Try again
        </button>
        <Link
          href="/app"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-[var(--ucsd-blue)] hover:bg-gray-50"
        >
          Go to the upload page
        </Link>
      </div>
    </div>
  );
}
