'use client';

import { useEffect, useRef } from 'react';
import { runAudit } from '@/lib/audit/engine';
import { parsePdfBytes } from '@/lib/pdf/parser';
import { remediatePdf } from '@/lib/remediate/engine';
import { useAppStore } from '@/stores/app-store';

export function QueueProcessor() {
  const files = useAppStore((s) => s.files);
  const updateFile = useAppStore((s) => s.updateFile);
  const processing = useRef(new Set<string>());

  useEffect(() => {
    const next = files.find((file) => file.status === 'queued' && !processing.current.has(file.id));
    if (!next) return;

    processing.current.add(next.id);

    (async () => {
      try {
        updateFile(next.id, { status: 'parsing', progress: 10 });
        const parsedData = await parsePdfBytes(next.originalBytes.slice(0));

        updateFile(next.id, { status: 'auditing', progress: 45, parsedData });
        const auditResult = runAudit(parsedData);

        updateFile(next.id, { status: 'remediating', progress: 75, auditResult });
        const remediated = await remediatePdf(parsedData, parsedData.language ?? 'en-US');
        const remediatedBytes = new Uint8Array(remediated).buffer;
        const remediatedParsedData = await parsePdfBytes(remediatedBytes.slice(0));

        const postRemediationAudit = runAudit(remediatedParsedData);
        updateFile(next.id, {
          status: 'remediated',
          progress: 100,
          remediatedBytes,
          postRemediationAudit
        });
      } catch (error) {
        updateFile(next.id, {
          status: 'error',
          progress: 100,
          error: error instanceof Error ? error.message : 'Failed to process PDF'
        });
      } finally {
        processing.current.delete(next.id);
      }
    })();
  }, [files, updateFile]);

  return null;
}
