'use client';

import { useEffect, useRef } from 'react';
import { runAudit } from '@/lib/audit/engine';
import { parsePdfBytes } from '@/lib/pdf/parser';
import { runOcrViaApi } from '@/lib/ocr/client';
import { isLikelyScannedPdf } from '@/lib/ocr/detection';
import { runLocalOcr } from '@/lib/ocr/local';
import { remediatePdf } from '@/lib/remediate/engine';
import { runVerapdfViaApi } from '@/lib/verapdf/client';
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
        const uploadedBytes = next.uploadedBytes.slice(0);
        const originalParsedData = await parsePdfBytes(uploadedBytes.slice(0));
        let remediationSourceBytes = uploadedBytes.slice(0);
        let remediationParsedData = originalParsedData;
        let ocrAttempted = false;
        let ocrApplied = false;
        let localOcrApplied = false;
        let ocrReason: string | undefined;

        if (isLikelyScannedPdf(originalParsedData)) {
          ocrAttempted = true;
          updateFile(next.id, { status: 'ocr', progress: 30 });
          const ocrResult = await runOcrViaApi(remediationSourceBytes.slice(0), next.name, originalParsedData.language);

          if (ocrResult.bytes) {
            remediationSourceBytes = ocrResult.bytes;
            remediationParsedData = await parsePdfBytes(remediationSourceBytes.slice(0));
            ocrApplied = true;
            ocrReason = undefined;
          } else {
            const localOcr = await runLocalOcr(
              remediationParsedData,
              remediationSourceBytes.slice(0),
              remediationParsedData.language
            );
            if (localOcr.applied && localOcr.parsed) {
              remediationParsedData = localOcr.parsed;
              ocrApplied = true;
              localOcrApplied = true;
              ocrReason = ocrResult.reason ? `${ocrResult.reason}; used local OCR fallback` : 'Used local OCR fallback';
            } else {
              ocrReason = ocrResult.reason ?? localOcr.reason;
            }
          }
        }

        updateFile(next.id, {
          status: 'auditing',
          progress: 45,
          parsedData: originalParsedData,
          ocrAttempted,
          ocrApplied,
          ocrReason
        });
        const auditResult = runAudit(originalParsedData);

        updateFile(next.id, { status: 'remediating', progress: 75, auditResult });
        const remediated = await remediatePdf(
          remediationParsedData,
          remediationParsedData.language ?? originalParsedData.language ?? 'en-US',
          remediationSourceBytes.slice(0),
          { addInvisibleTextLayer: localOcrApplied }
        );
        const remediatedBytes = new Uint8Array(remediated).buffer;
        const remediatedParsedData = await parsePdfBytes(remediatedBytes.slice(0));

        const postRemediationAudit = runAudit(remediatedParsedData);
        updateFile(next.id, { status: 'remediating', progress: 90, postRemediationAudit });
        const verapdfResult = await runVerapdfViaApi(remediatedBytes.slice(0), `remediated-${next.name}`);

        updateFile(next.id, {
          status: 'remediated',
          progress: 100,
          ocrAttempted,
          ocrApplied,
          ocrReason,
          remediatedBytes,
          postRemediationAudit,
          verapdfResult
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
