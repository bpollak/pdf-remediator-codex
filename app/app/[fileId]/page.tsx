'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { SummaryDashboard } from '@/components/report/SummaryDashboard';
import { IssueList } from '@/components/report/IssueList';
import { StructuralIntegrityPanel } from '@/components/report/StructuralIntegrityPanel';
import { useDocumentTitle } from '@/components/ux/useDocumentTitle';
import { pageTitle } from '@/lib/content/site';
import { useAppStore } from '@/stores/app-store';

const REPORT_HEADING = 'Technical report (for accessibility staff)';

/**
 * Detailed findings for accessibility staff, linked from the results page.
 * Rule ids and PDF terms are fine here; the results page stays plain.
 */
export default function FileReportPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const hydrated = useAppStore((s) => s.hydrated);
  const documentName = useAppStore((s) => s.files.find((entry) => entry.id === fileId)?.name);
  const fileExists = documentName !== undefined;

  useDocumentTitle(
    pageTitle(!hydrated ? 'Technical report' : fileExists ? `Technical report: ${documentName}` : 'Result unavailable')
  );

  if (!hydrated) {
    return (
      <div className="space-y-3">
        <h1>{REPORT_HEADING}</h1>
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
      <div className="space-y-2">
        <h1>{REPORT_HEADING}</h1>
        <p className="text-sm text-[var(--ucsd-text)]">Document: {documentName}</p>
        <p className="max-w-3xl text-sm text-[var(--ucsd-text)]">
          Rule-level findings for the original upload and the updated PDF. The publish decision and the checklist
          are on the results page.
        </p>
        <Link
          href={`/app/${encodeURIComponent(fileId)}/compare`}
          className="inline-flex text-sm font-semibold text-[var(--ucsd-blue)] underline hover:text-[var(--ucsd-navy)]"
        >
          Back to results
        </Link>
      </div>

      <section aria-labelledby="report-summary" className="space-y-3">
        <h2 id="report-summary">Updated PDF</h2>
        <SummaryDashboard fileId={fileId} variant="remediated" />
      </section>

      <StructuralIntegrityPanel fileId={fileId} />

      <section aria-labelledby="report-remaining" className="space-y-3">
        <h2 id="report-remaining">Findings in the updated PDF</h2>
        <IssueList fileId={fileId} variant="remediated" />
      </section>

      <section aria-labelledby="report-original" className="space-y-3">
        <h2 id="report-original">Findings in the original upload</h2>
        <IssueList fileId={fileId} variant="original" />
      </section>
    </div>
  );
}
