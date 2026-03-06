/// <reference lib="webworker" />

import { remediatePdf } from '@/lib/remediate/engine';
import type { RemediateWorkerRequest, RemediateWorkerResponse } from '@/types/worker-messages';

self.onmessage = async (event: MessageEvent<RemediateWorkerRequest>) => {
  const msg = event.data;
  if (msg.type !== 'remediate') return;

  try {
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: 'progress',
      fileId: msg.fileId,
      progress: 80,
      label: 'Generating remediated PDF...'
    } satisfies RemediateWorkerResponse);

    const result = await remediatePdf(msg.parsed, msg.language, msg.sourceBytes, msg.options);
    const bytes =
      result instanceof Uint8Array
        ? result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength)
        : result;

    (self as DedicatedWorkerGlobalScope).postMessage(
      { type: 'remediated', fileId: msg.fileId, bytes } satisfies RemediateWorkerResponse,
      [bytes]
    );
  } catch (error) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: 'error',
      fileId: msg.fileId,
      error: error instanceof Error ? error.message : 'Unknown remediation error'
    } satisfies RemediateWorkerResponse);
  }
};
