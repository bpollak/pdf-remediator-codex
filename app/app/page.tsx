'use client';

import { DropZone } from '@/components/upload/DropZone';
import { FileQueue } from '@/components/upload/FileQueue';
import { QueueProcessor } from '@/components/upload/QueueProcessor';

export default function AppPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200 pb-4">
        <h2 className="text-xl font-semibold text-[var(--ucsd-navy)]">Upload and remediate</h2>
        <p className="mt-1 text-sm text-gray-500">
          Add your PDFs below. Each file is audited, remediated, and ready to compare in seconds.
        </p>
      </div>
      <DropZone />
      <QueueProcessor />
      <FileQueue />
    </div>
  );
}
