/// <reference lib="webworker" />

import { runAudit } from '@/lib/audit/engine';
import type { AuditWorkerRequest, AuditWorkerResponse } from '@/types/worker-messages';

self.onmessage = (event: MessageEvent<AuditWorkerRequest>) => {
  const msg = event.data;
  if (msg.type !== 'audit') return;

  try {
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: 'progress',
      fileId: msg.fileId,
      progress: 60,
      label: 'Running audit rules...'
    } satisfies AuditWorkerResponse);

    const result = runAudit(msg.parsed);

    (self as DedicatedWorkerGlobalScope).postMessage({
      type: 'audited',
      fileId: msg.fileId,
      result
    } satisfies AuditWorkerResponse);
  } catch (error) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: 'error',
      fileId: msg.fileId,
      error: error instanceof Error ? error.message : 'Unknown audit error'
    } satisfies AuditWorkerResponse);
  }
};
