'use client';

import { ErrorFallback } from '@/components/app/ErrorFallback';

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorFallback error={error} reset={reset} />;
}
