'use client';

import { useEffect, useRef } from 'react';
import { runAudit } from '@/lib/audit/engine';
import type { AuditResult } from '@/lib/audit/types';
import { parsePdfBytes } from '@/lib/pdf/parser';
import { runOcrViaApi } from '@/lib/ocr/client';
import { isLikelyScannedPdf } from '@/lib/ocr/detection';
import { runLocalOcr } from '@/lib/ocr/local';
import { remediatePdf } from '@/lib/remediate/engine';
import {
  MAX_REMEDIATION_ITERATIONS,
  computeFailureScore,
  createByteFingerprint,
  decideRemediationLoop,
  selectBestRemediationIteration,
  type RemediationIterationSummary,
  type RemediationStopReason
} from '@/lib/remediate/loop';
import { runVerapdfViaApi } from '@/lib/verapdf/client';
import type { VerapdfResult } from '@/lib/verapdf/types';
import { useAppStore } from '@/stores/app-store';

interface RemediationIterationArtifact {
  iteration: number;
  internalScore: number;
  failureScore?: number;
  verapdfResult: VerapdfResult;
  remediatedBytes: ArrayBuffer;
  postRemediationAudit: AuditResult;
}

export function QueueProcessor() {
  const files = useAppStore((s) => s.files);
  const updateFile = useAppStore((s) => s.updateFile);
  const processing = useRef(new Set<string>());

  useEffect(() => {
    if (processing.current.size > 0) return;
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

        const remediationIterations: RemediationIterationSummary[] = [];
        const remediationIterationArtifacts: RemediationIterationArtifact[] = [];
        let remediationStopReason: RemediationStopReason = 'max_iterations';
        let previousFingerprint: string | undefined;
        let previousFailureScore: number | undefined;
        let latestVerapdfResult: VerapdfResult | undefined;
        let currentSourceBytes = remediationSourceBytes.slice(0);
        let currentParsedData = remediationParsedData;

        for (let iteration = 1; iteration <= MAX_REMEDIATION_ITERATIONS; iteration += 1) {
          const remediated = await remediatePdf(
            currentParsedData,
            currentParsedData.language ?? originalParsedData.language ?? 'en-US',
            currentSourceBytes.slice(0),
            {
              addInvisibleTextLayer: localOcrApplied,
              strictPdfUa: iteration > 1,
              verapdfFeedback: latestVerapdfResult
            }
          );
          const remediatedBytes = new Uint8Array(remediated).buffer;
          const remediatedParsedData = await parsePdfBytes(remediatedBytes.slice(0));
          const postRemediationAudit = runAudit(remediatedParsedData);

          updateFile(next.id, {
            status: 'remediating',
            progress: 78 + Math.round((iteration / MAX_REMEDIATION_ITERATIONS) * 16),
            postRemediationAudit
          });

          const verapdfResult = await runVerapdfViaApi(remediatedBytes.slice(0), `remediated-${next.name}`);
          const failureScore = computeFailureScore(verapdfResult);
          const fingerprint = createByteFingerprint(remediatedBytes.slice(0));
          remediationIterations.push({
            iteration,
            internalScore: postRemediationAudit.score,
            verapdfCompliant: verapdfResult.compliant,
            failedRules: verapdfResult.summary?.failedRules,
            failedChecks: verapdfResult.summary?.failedChecks
          });
          remediationIterationArtifacts.push({
            iteration,
            internalScore: postRemediationAudit.score,
            failureScore,
            verapdfResult,
            remediatedBytes: remediatedBytes.slice(0),
            postRemediationAudit
          });

          const loopDecision = decideRemediationLoop({
            iteration,
            maxIterations: MAX_REMEDIATION_ITERATIONS,
            verapdfResult,
            currentFingerprint: fingerprint,
            previousFingerprint,
            currentFailureScore: failureScore,
            previousFailureScore
          });

          latestVerapdfResult = verapdfResult;
          if (!loopDecision.continue) {
            remediationStopReason = loopDecision.reason ?? 'max_iterations';
            break;
          }

          previousFingerprint = fingerprint;
          previousFailureScore = failureScore;
          currentSourceBytes = remediatedBytes.slice(0);
          currentParsedData = remediatedParsedData;
        }

        const selected = selectBestRemediationIteration(remediationIterationArtifacts, auditResult.score);
        if (!selected) {
          throw new Error('Remediation loop did not produce a remediated artifact.');
        }
        const selectedArtifact = remediationIterationArtifacts.find((artifact) => artifact.iteration === selected.iteration);
        if (!selectedArtifact) {
          throw new Error('Selected remediation iteration artifact was not found.');
        }

        updateFile(next.id, {
          status: 'remediated',
          progress: 100,
          ocrAttempted,
          ocrApplied,
          ocrReason,
          remediatedBytes: selectedArtifact.remediatedBytes,
          postRemediationAudit: selectedArtifact.postRemediationAudit,
          verapdfResult: selectedArtifact.verapdfResult,
          remediationIterations,
          remediationStopReason
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
