'use client';

import { DropZone } from '@/components/upload/DropZone';
import { FileQueue } from '@/components/upload/FileQueue';
import { QueueProcessor } from '@/components/upload/QueueProcessor';

export default function AppPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200 pb-4">
        <h2 className="text-xl font-semibold text-[var(--ucsd-navy)]">Batch upload and processing</h2>
        <p className="mt-1 text-sm text-gray-500">
          Upload PDFs to audit accessibility and generate remediated versions side by side.
        </p>
      </div>
      <DropZone />
      <QueueProcessor />
      <FileQueue />
    </div>
  );
}
