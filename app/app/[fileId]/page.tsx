'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { SummaryDashboard } from '@/components/report/SummaryDashboard';
import { IssueList } from '@/components/report/IssueList';
import { StructuralIntegrityPanel } from '@/components/report/StructuralIntegrityPanel';
import { useAppStore } from '@/stores/app-store';

export default function FileReportPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const hydrated = useAppStore((s) => s.hydrated);
  const documentName = useAppStore((s) => s.files.find((entry) => entry.id === fileId)?.name);
  const fileExists = documentName !== undefined;

  if (!hydrated) {
    return (
      <div className="space-y-3">
        <h1>Accessibility Findings</h1>
        <p className="text-sm text-[var(--ucsd-text)]">Loading saved results...</p>
      </div>
    );
  }

  if (!fileExists) {
    return (
      <div className="space-y-4">
        <h1>Result unavailable</h1>
        <p className="max-w-2xl text-sm text-[var(--ucsd-text)]">
          This result is not saved in this browser session. Upload the PDF again to create a fresh result.
        </p>
        <Link
          href="/app"
          className="inline-flex rounded-md bg-[var(--ucsd-blue)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--ucsd-navy)]"
        >
          Upload PDF
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="break-words">Accessibility Findings</h1>
        <p className="break-words text-sm text-[var(--ucsd-text)]">Document: {documentName}</p>
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
