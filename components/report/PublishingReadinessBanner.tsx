'use client';

import { useAppStore } from '@/stores/app-store';
import type { FileEntry } from '@/stores/app-store';

type ReadinessState = 'ready' | 'needs-fixes' | 'verification-unavailable' | 'processing';

function isVerificationUnavailable(reason: string | undefined): boolean {
  if (!reason) return false;
  return /unavailable|failed to contact|timed out|not enabled|not configured/i.test(reason);
}

function getReadinessState(file: FileEntry | undefined): {
  state: ReadinessState;
  message: string;
} {
  if (!file || file.status !== 'remediated') {
    return {
      state: 'processing' as const,
      message: 'Processing in progress. Readiness status appears after remediation finishes.'
    };
  }

  const remainingInternal = file.postRemediationAudit?.findings.length ?? 0;
  const failedRules = file.verapdfResult?.summary?.failedRules ?? 0;
  const failedChecks = file.verapdfResult?.summary?.failedChecks ?? 0;
  const unavailable =
    !file.verapdfResult ||
    file.verapdfResult.attempted === false ||
    isVerificationUnavailable(file.verapdfResult.reason);

  if (unavailable) {
    return {
      state: 'verification-unavailable' as const,
      message:
        'Verification unavailable. Use the manual checklist and run a desktop checker (Acrobat or PAC) before publishing.'
    };
  }

  if (remainingInternal > 0 || failedRules > 0 || failedChecks > 0) {
    return {
      state: 'needs-fixes' as const,
      message: 'Review the high-priority items in "What To Do Next" before publishing.'
    };
  }

  if (file.remediationMode === 'analysis-only') {
    return {
      state: 'needs-fixes' as const,
      message:
        'Automation completed in analysis-only mode. Manual structural tagging and desktop checker validation are required before publishing.'
    };
  }

  return {
    state: 'ready' as const,
    message: 'Ready for manual final review. Download the updated PDF and perform your normal spot-check before publishing.'
  };
}

const stateClasses: Record<ReadinessState, string> = {
  ready: 'border-green-200 bg-green-50 text-green-900',
  'needs-fixes': 'border-amber-200 bg-amber-50 text-amber-900',
  'verification-unavailable': 'border-blue-200 bg-blue-50 text-blue-900',
  processing: 'border-gray-200 bg-gray-50 text-gray-700'
};

const stateLabel: Record<ReadinessState, string> = {
  ready: 'Publishing readiness: Ready for manual final review',
  'needs-fixes': 'Publishing readiness: Review checklist before publishing',
  'verification-unavailable': 'Publishing readiness: External verification unavailable',
  processing: 'Publishing readiness: Processing'
};

export function PublishingReadinessBanner({ fileId }: { fileId: string }) {
  const file = useAppStore((s) => s.files.find((entry) => entry.id === fileId));
  const readiness = getReadinessState(file);
  const classes = stateClasses[readiness.state];

  return (
    <section className={`rounded border p-4 shadow-sm ${classes}`} aria-live="polite">
      <p className="text-sm font-semibold">{stateLabel[readiness.state]}</p>
      <p className="mt-1 text-sm">{readiness.message}</p>
    </section>
  );
}
