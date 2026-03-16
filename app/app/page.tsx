'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { DropZone } from '@/components/upload/DropZone';
import { FileQueue } from '@/components/upload/FileQueue';
import { QueueProcessor } from '@/components/upload/QueueProcessor';
import { useAppStore } from '@/stores/app-store';

function AppPageFallback() {
  return (
    <div className="space-y-6">
      <div id="upload-revised-pdf" className="border-b border-gray-200 pb-4 scroll-mt-24">
        <h1>Upload your PDF</h1>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">
          We will check for accessibility issues, apply automated fixes, and show what still needs your attention.
        </p>
      </div>
      <div className="rounded border border-[rgba(24,43,73,0.15)] bg-slate-50 p-4 text-sm text-[var(--ucsd-text)]">
        Loading upload workflow...
      </div>
    </div>
  );
}

function AppPageContent() {
  const searchParams = useSearchParams();
  const files = useAppStore((state) => state.files);
  const hydrated = useAppStore((state) => state.hydrated);
  const revalidateFor = searchParams.get('revalidateFor');
  const baseFile = revalidateFor ? files.find((file) => file.id === revalidateFor) : undefined;
  const hasCompletedWorkflow = files.some((file) => file.status === 'remediated');

  return (
    <div className="space-y-6">
      <div id="upload-revised-pdf" className="border-b border-gray-200 pb-4 scroll-mt-24">
        <h1>{baseFile ? 'Upload revised PDF for validation' : 'Upload your PDF'}</h1>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">
          {baseFile
            ? 'We will compare the revised PDF against your earlier results.'
            : 'We will check for accessibility issues, apply automated fixes, and show what still needs your attention.'}
        </p>
        {hasCompletedWorkflow && !baseFile ? (
          <p className="mt-1 text-sm text-[var(--ucsd-text)]">
            Already made manual fixes? Upload the revised PDF here to re-check it. You can also start fresh with a new file.
          </p>
        ) : null}
      </div>
      {baseFile ? (
        <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">Re-validation target: {baseFile.name}</p>
          <p className="mt-1">
            This upload will be linked to the earlier review so you can compare the revised PDF against that prior
            workflow.
          </p>
        </div>
      ) : revalidateFor && hydrated ? (
        <div className="rounded border border-[rgba(24,43,73,0.15)] bg-slate-50 p-4 text-sm text-[var(--ucsd-text)]">
          The earlier review could not be found. Uploading here will start a new remediation workflow.
        </div>
      ) : null}
      <DropZone />
      <QueueProcessor />
      <FileQueue />
    </div>
  );
}

export default function AppPage() {
  return (
    <Suspense fallback={<AppPageFallback />}>
      <AppPageContent />
    </Suspense>
  );
}
