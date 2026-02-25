'use client';

import { DropZone } from '@/components/upload/DropZone';
import { FileQueue } from '@/components/upload/FileQueue';
import { QueueProcessor } from '@/components/upload/QueueProcessor';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SKIP_LANDING_PREFERENCE_KEY } from '@/lib/preferences/landing';

export default function AppPage() {
  const [skipLanding, setSkipLanding] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(SKIP_LANDING_PREFERENCE_KEY) === '1';
    setSkipLanding(stored);
  }, []);

  function onSkipLandingChange(checked: boolean) {
    setSkipLanding(checked);
    window.localStorage.setItem(SKIP_LANDING_PREFERENCE_KEY, checked ? '1' : '0');
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200 pb-4">
        <h1>Upload your PDF</h1>
        <p className="mt-1 text-sm text-[var(--ucsd-text)]">
          We will check accessibility issues, apply automated fixes, and show what still needs manual review.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--ucsd-text)]">
          <input
            type="checkbox"
            checked={skipLanding}
            onChange={(event) => onSkipLandingChange(event.target.checked)}
          />
          Open this app directly next time (skip Home)
        </label>
      </div>

      <section className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Important before publishing</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Automated Check Score is an internal ruleset signal, not a compliance guarantee.</li>
          <li>Files marked analysis-only still require manual structural tagging before release.</li>
          <li>Complete desktop checker and assistive-technology spot checks on final output.</li>
        </ul>
        <p className="mt-2">
          For full interpretation guidance, review the{' '}
          <Link href="/about" className="underline">
            About page
          </Link>
          .
        </p>
      </section>
      <DropZone />
      <QueueProcessor />
      <FileQueue />
    </div>
  );
}
