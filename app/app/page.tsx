'use client';

import { useSearchParams } from 'next/navigation';
import { DropZone } from '@/components/upload/DropZone';
import { FileQueue } from '@/components/upload/FileQueue';
import { QueueProcessor } from '@/components/upload/QueueProcessor';
import { useAppStore } from '@/stores/app-store';

export default function AppPage() {
  const searchParams = useSearchParams();
  const files = useAppStore((state) => state.files);
  const hydrated = useAppStore((state) => state.hydrated);
  const revalidateFor = searchParams.get('revalidateFor');
  const baseFile = revalidateFor ? files.find((file) => file.id === revalidateFor) : undefined;

  return (
    <div className="space-y-6">
      <div id="upload-revised-pdf" className="border-b border-gray-200 pb-4 scroll-mt-24">
        <h1>{baseFile ? 'Upload revised PDF for validation' : 'Upload your PDF'}</h1>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">
          We will check accessibility issues, apply automated fixes, and show what still needs manual review.
        </p>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">
          After you make manual fixes in Acrobat, PAC, or the source document, upload the revised PDF here to run
          validation again.
        </p>
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
