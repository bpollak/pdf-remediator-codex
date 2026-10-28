'use client';

import { ErrorFallback } from '@/components/app/ErrorFallback';

/** Keeps the /app layout (and the processing queue) running when a page fails. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorFallback error={error} reset={reset} />;
}
