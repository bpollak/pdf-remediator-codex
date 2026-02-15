'use client';

import { DropZone } from '@/components/upload/DropZone';
import { FileQueue } from '@/components/upload/FileQueue';
import { QueueProcessor } from '@/components/upload/QueueProcessor';

export default function AppPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Batch upload and processing</h2>
      <DropZone />
      <QueueProcessor />
      <FileQueue />
    </div>
  );
}
