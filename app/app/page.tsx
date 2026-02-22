'use client';

import { DropZone } from '@/components/upload/DropZone';
import { FileQueue } from '@/components/upload/FileQueue';
import { QueueProcessor } from '@/components/upload/QueueProcessor';

export default function AppPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl">Upload your PDF</h1>
        <p className="mt-1 text-sm text-gray-500">
          We will check accessibility issues, apply automated fixes, and show what still needs manual review.
        </p>
      </div>
      <DropZone />
      <QueueProcessor />
      <FileQueue />
    </div>
  );
}
