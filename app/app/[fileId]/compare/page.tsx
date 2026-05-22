'use client';

import { SimpleResultsPage } from '@/components/report/SimpleResultsPage';
import { useAppStore } from '@/stores/app-store';

export default function ComparePage({ params }: { params: { fileId: string } }) {
  const hydrated = useAppStore((state) => state.hydrated);

  if (!hydrated) {
    return (
      <div className="space-y-3">
        <h1>Loading result</h1>
        <p className="text-sm text-[var(--ucsd-text)]">Loading saved PDF result...</p>
      </div>
    );
  }

  return <SimpleResultsPage fileId={params.fileId} />;
}
