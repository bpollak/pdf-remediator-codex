import Link from 'next/link';
import { summarizeFileChanges, type RemainingItem } from '@/lib/report/remediation-diff';
import type { FileEntry } from '@/types/file-entry';

function whereLabel(item: RemainingItem): string | undefined {
  if (item.pages.length > 0) {
    const shown = item.pages.slice(0, 5).join(', ');
    const more = item.pages.length > 5 ? ' and more' : '';
    return `${item.pages.length === 1 ? 'Page' : 'Pages'} ${shown}${more}`;
  }
  return item.count > 1 ? `${item.count} places` : undefined;
}

/** "What we fixed automatically" and "What's still left", in plain words. */
export function ResultsChanges({ file, reportHref }: { file: FileEntry; reportHref: string }) {
  const { fixed, remaining, notChecked } = summarizeFileChanges(file);
  const failedRules = file.verapdfResult?.summary?.failedRules ?? 0;
  const nothingLeft = remaining.length === 0 && notChecked.length === 0 && failedRules === 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section
        aria-labelledby="fixed-heading"
        className="rounded-lg border border-[rgba(24,43,73,0.18)] bg-white p-5 shadow-sm"
      >
        <h2 id="fixed-heading">What we fixed automatically</h2>
        {fixed.length > 0 ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed text-[var(--ucsd-text)]">
            {fixed.map((item) => (
              <li key={item.ruleId}>
                {item.label}
                {item.fixedCount > 1 ? ` (${item.fixedCount} places)` : ''}
                {item.partial ? ' — some are still left' : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[var(--ucsd-text)]">
            We didn&apos;t find anything we could safely fix automatically.
          </p>
        )}
      </section>

      <section
        aria-labelledby="left-heading"
        className="rounded-lg border border-[rgba(24,43,73,0.18)] bg-white p-5 shadow-sm"
      >
        <h2 id="left-heading">What&apos;s still left</h2>
        {nothingLeft ? (
          <p className="mt-3 text-sm leading-relaxed text-[var(--ucsd-text)]">
            Our automated checks found nothing else to fix. A person still needs to review the PDF before publishing.
          </p>
        ) : (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed text-[var(--ucsd-text)]">
            {remaining.map((item) => {
              const where = whereLabel(item);
              return (
                <li key={item.ruleId}>
                  {item.title}
                  {where ? <span className="text-[var(--ucsd-text)]"> ({where})</span> : null}
                </li>
              );
            })}
            {notChecked.length > 0 ? (
              <li>We couldn&apos;t check {notChecked.join(', ')}. Check it yourself before publishing.</li>
            ) : null}
            {failedRules > 0 ? (
              <li>
                Our PDF/UA checker still reports {failedRules} {failedRules === 1 ? 'problem' : 'problems'} in the
                hidden structure. Accessibility staff can see them in the technical report.
              </li>
            ) : null}
          </ul>
        )}
        {!nothingLeft ? (
          <p className="mt-3 text-sm text-[var(--ucsd-text)]">
            The checklist below covers the ones you must fix before publishing.
          </p>
        ) : null}
        <p className="mt-3 text-sm">
          <Link href={reportHref} className="text-[var(--ucsd-blue)] underline hover:text-[var(--ucsd-navy)]">
            Technical report (for accessibility staff)
          </Link>
        </p>
      </section>
    </div>
  );
}
