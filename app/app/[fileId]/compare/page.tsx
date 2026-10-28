'use client';

import { useParams } from 'next/navigation';
import { SimpleResultsPage } from '@/components/report/SimpleResultsPage';
import { useDocumentTitle } from '@/components/ux/useDocumentTitle';
import { pageTitle } from '@/lib/content/site';
import { useAppStore } from '@/stores/app-store';

export default function ComparePage() {
  const { fileId } = useParams<{ fileId: string }>();
  const hydrated = useAppStore((state) => state.hydrated);
  const documentName = useAppStore((state) => state.files.find((entry) => entry.id === fileId)?.name);

  useDocumentTitle(
    pageTitle(!hydrated ? 'Finish your PDF' : documentName ? `Finish your PDF: ${documentName}` : 'Result unavailable')
  );

  if (!hydrated) {
    return (
      <div className="space-y-3">
        <h1>Loading result</h1>
        <p className="text-sm text-[var(--ucsd-text)]">Loading saved PDF result...</p>
      </div>
    );
  }

  return <SimpleResultsPage fileId={fileId} />;
}
