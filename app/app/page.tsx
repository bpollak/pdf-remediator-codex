'use client';

import { DropZone } from '@/components/upload/DropZone';
import { FileQueue } from '@/components/upload/FileQueue';
import { QueueProcessor } from '@/components/upload/QueueProcessor';

export default function AppPage() {
  return (
    <div className="space-y-6">
      <div id="upload-revised-pdf" className="border-b border-gray-200 pb-4 scroll-mt-24">
        <h1>Upload your PDF</h1>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">
          We will check accessibility issues, apply automated fixes, and show what still needs manual review.
        </p>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">
          After you make manual fixes in Acrobat, PAC, or the source document, upload the revised PDF here to run validation again.
        </p>
      </div>
      <DropZone />
      <QueueProcessor />
      <FileQueue />
    </div>
  );
}
