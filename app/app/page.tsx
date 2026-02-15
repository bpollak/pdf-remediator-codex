'use client';

import { DropZone } from '@/components/upload/DropZone';
import { FileQueue } from '@/components/upload/FileQueue';
import { QueueProcessor } from '@/components/upload/QueueProcessor';

export default function AppPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-[var(--ucsd-navy)]">Batch upload and processing</h2>
      <p className="text-[var(--ucsd-blue)]">UC San Diego Accessible PDF analyzes original and remediated documents side by side.</p>
      <DropZone />
      <QueueProcessor />
      <FileQueue />
    </div>
  );
}
