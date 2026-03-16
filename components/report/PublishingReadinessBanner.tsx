'use client';

import { useAppStore } from '@/stores/app-store';
import { getAccessibilityStatus } from '@/lib/report/accessibility-status';

const stateClasses = {
  accessible: 'border-green-200 bg-green-50 text-green-900',
  'not-yet-accessible': 'border-red-200 bg-red-50 text-red-900',
  'verification-unavailable': 'border-blue-200 bg-blue-50 text-blue-900',
  processing: 'border-gray-200 bg-gray-50 text-gray-700'
};

export function PublishingReadinessBanner({ fileId }: { fileId: string }) {
  const file = useAppStore((s) => s.files.find((entry) => entry.id === fileId));
  const status = getAccessibilityStatus(file);
  const classes = stateClasses[status.status];

  return (
    <section className={`rounded border p-4 shadow-sm ${classes}`} aria-live="polite">
      <p className="text-sm font-semibold">Accessibility status</p>
      <p className="mt-1 text-xl font-semibold">{status.label}</p>
      <p className="mt-1 text-sm">{status.message}</p>
      {status.reasons.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Blocking reasons">
          {status.reasons.map((reason) => (
            <li
              key={reason.code}
              className="rounded-full border border-current/20 bg-white/70 px-2.5 py-1 text-xs font-medium"
            >
              {reason.label}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
