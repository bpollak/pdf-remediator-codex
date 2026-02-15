/// <reference lib="webworker" />

import { parsePdfBytes } from '@/lib/pdf/parser';
import type { ParseWorkerRequest, ParseWorkerResponse } from '@/types/worker-messages';

self.onmessage = async (event: MessageEvent<ParseWorkerRequest>) => {
  const msg = event.data;
  if (msg.type !== 'parse') return;

  try {
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: 'progress',
      fileId: msg.fileId,
      progress: 30,
      label: 'Parsing PDF...'
    } satisfies ParseWorkerResponse);

    const parsed = await parsePdfBytes(msg.bytes);

    (self as DedicatedWorkerGlobalScope).postMessage({
      type: 'parsed',
      fileId: msg.fileId,
      parsed
    } satisfies ParseWorkerResponse);
  } catch (error) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: 'error',
      fileId: msg.fileId,
      error: error instanceof Error ? error.message : 'Unknown parse error'
    } satisfies ParseWorkerResponse);
  }
};
