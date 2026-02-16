/// <reference lib="webworker" />

import { remediatePdf } from '@/lib/remediate/engine';
import type { ParsedPDF } from '@/lib/pdf/types';

self.onmessage = async (event: MessageEvent<{ fileId: string; parsed: ParsedPDF; language?: string; sourceBytes?: ArrayBuffer }>) => {
  const msg = event.data;
  try {
    const bytes = await remediatePdf(msg.parsed, msg.language, msg.sourceBytes);
    (self as DedicatedWorkerGlobalScope).postMessage({ type: 'remediated', fileId: msg.fileId, bytes }, [bytes.buffer]);
  } catch (error) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: 'error',
      fileId: msg.fileId,
      error: error instanceof Error ? error.message : 'Unknown remediation error'
    });
  }
};
