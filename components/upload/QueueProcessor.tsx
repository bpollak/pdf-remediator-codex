'use client';

import { useEffect, useRef } from 'react';
import { runAudit } from '@/lib/audit/engine';
import { parsePdfBytes } from '@/lib/pdf/parser';
import { runOcrViaApi } from '@/lib/ocr/client';
import { isLikelyScannedPdf } from '@/lib/ocr/detection';
import { runLocalOcr } from '@/lib/ocr/local';
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
        let sourceBytes = next.uploadedBytes.slice(0);
        let parsedData = await parsePdfBytes(sourceBytes.slice(0));
        let ocrAttempted = false;
        let ocrApplied = false;
        let ocrReason: string | undefined;

        if (isLikelyScannedPdf(parsedData)) {
          ocrAttempted = true;
          updateFile(next.id, { status: 'ocr', progress: 30 });
          const ocrResult = await runOcrViaApi(sourceBytes.slice(0), next.name, parsedData.language);

          if (ocrResult.bytes) {
            sourceBytes = ocrResult.bytes;
            parsedData = await parsePdfBytes(sourceBytes.slice(0));
            ocrApplied = true;
            ocrReason = undefined;
          } else {
            const localOcr = await runLocalOcr(parsedData, sourceBytes.slice(0), parsedData.language);
            if (localOcr.applied && localOcr.parsed) {
              parsedData = localOcr.parsed;
              ocrApplied = true;
              ocrReason = ocrResult.reason ? `${ocrResult.reason}; used local OCR fallback` : 'Used local OCR fallback';
            } else {
              ocrReason = ocrResult.reason ?? localOcr.reason;
            }
          }
        }

        updateFile(next.id, { status: 'auditing', progress: 45, parsedData, ocrAttempted, ocrApplied, ocrReason });
        const auditResult = runAudit(parsedData);

        updateFile(next.id, { status: 'remediating', progress: 75, auditResult });
        const remediated = await remediatePdf(parsedData, parsedData.language ?? 'en-US', sourceBytes.slice(0));
        const remediatedBytes = new Uint8Array(remediated).buffer;
        const remediatedParsedData = await parsePdfBytes(remediatedBytes.slice(0));

        const postRemediationAudit = runAudit(remediatedParsedData);
        updateFile(next.id, {
          status: 'remediated',
          progress: 100,
          ocrAttempted,
          ocrApplied,
          ocrReason,
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
