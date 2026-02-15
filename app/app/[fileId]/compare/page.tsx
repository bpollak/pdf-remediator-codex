'use client';

import { SideBySide } from '@/components/preview/SideBySide';

export default function ComparePage({ params }: { params: { fileId: string } }) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Before/after compare: {params.fileId}</h2>
      <SideBySide fileId={params.fileId} />
    </div>
  );
}
