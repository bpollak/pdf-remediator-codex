'use client';

import { use } from 'react';
import { SummaryDashboard } from '@/components/report/SummaryDashboard';
import { IssueList } from '@/components/report/IssueList';
import { StructuralIntegrityPanel } from '@/components/report/StructuralIntegrityPanel';
import { useAppStore } from '@/stores/app-store';

export default function FileReportPage({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = use(params);
  const hydrated = useAppStore((s) => s.hydrated);
  const documentName = useAppStore((s) => s.files.find((entry) => entry.id === fileId)?.name);

  if (!hydrated) {
    return (
      <div className="space-y-3">
        <h1>Accessibility Findings</h1>
        <p className="text-sm text-[var(--ucsd-text)]">Loading saved results...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="break-words">Accessibility Findings</h1>
        <p className="break-words text-sm text-[var(--ucsd-text)]">Document: {documentName ?? 'Uploaded PDF'}</p>
        <p className="text-sm text-[var(--ucsd-text)]">
          Review the uploaded PDF findings here. Use the compare workflow for download, manual follow-up, and publish guidance.
        </p>
      </div>
      <SummaryDashboard fileId={fileId} />
      <StructuralIntegrityPanel fileId={fileId} />
      <IssueList fileId={fileId} />
    </div>
  );
}
