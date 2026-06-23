'use client';

import { useEffect, useRef } from 'react';
import type { AuditResult } from '@/lib/audit/types';
import { classifyPdfSource } from '@/lib/pdf/source-type';
import type { ParsedPDF, RemediationMode } from '@/lib/pdf/types';
import { assessOcrTextGain, isLikelyScannedPdf } from '@/lib/ocr/detection';
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
import { getVerapdfComplianceVerdict } from '@/lib/verapdf/result';
import { useAppStore } from '@/stores/app-store';
import { parsePdfInWorker, remediatePdfInWorker, runAuditInWorker } from '@/lib/workers/client';

interface RemediationIterationArtifact {
  iteration: number;
  internalScore: number;
  failureScore?: number;
  remediationMode: RemediationMode;
  remediatedParsedData: ParsedPDF;
  verapdfResult: VerapdfResult;
  remediatedBytes: ArrayBuffer;
  postRemediationAudit: AuditResult;
}

function remediationModeForParsed(parsed: ParsedPDF): RemediationMode {
  if (parsed.remediationMode) return parsed.remediationMode;
  return parsed.structureBinding?.hasContentBinding ? 'content-bound' : 'analysis-only';
}

// If an async operation takes longer than this, assume it is stuck and
// allow the queue to move on.  This prevents permanent deadlocks when an
// unhandled error leaves a file ID in the processing set.
const STALE_PROCESSING_TIMEOUT_MS = 120_000;

function friendlyProcessingError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/password|encrypt/i.test(message)) {
    return 'This PDF is password-protected. Remove the password protection, then upload it again.';
  }
  if (/invalid|corrupt|malformed|unexpected|parse/i.test(message)) {
    return `Could not read this PDF (${message}). Re-export the PDF from its source document (for example Word or PowerPoint), then upload it again.`;
  }
  if (message) {
    return `${message} Try uploading the file again. If it keeps failing, re-export the PDF from its source document.`;
  }
  return 'Failed to process this PDF. Try uploading it again.';
}

export function QueueProcessor() {
  const files = useAppStore((s) => s.files);
  const hydrated = useAppStore((s) => s.hydrated);
  const updateFile = useAppStore((s) => s.updateFile);
  const releaseUploadedBytes = useAppStore((s) => s.releaseUploadedBytes);
  const ensureUploadedBytes = useAppStore((s) => s.ensureUploadedBytes);
  const processing = useRef(new Map<string, number>());

  useEffect(() => {
    if (!hydrated) return;

    // Evict stale entries that have been processing for too long.
    const now = Date.now();
    for (const [id, startedAt] of processing.current) {
      if (now - startedAt > STALE_PROCESSING_TIMEOUT_MS) {
        processing.current.delete(id);
      }
    }

    if (processing.current.size > 0) return;
    const next = files.find((file) => file.status === 'queued' && !processing.current.has(file.id));
    if (!next) return;

    processing.current.set(next.id, Date.now());

    (async () => {
      try {
        updateFile(next.id, { status: 'parsing', progress: 10, processingStartedAt: new Date().toISOString() });
        // Bytes may have been released from memory; reload from IndexedDB if needed.
        const uploadedBytes = next.uploadedBytes ?? await ensureUploadedBytes(next.id);
        if (!uploadedBytes) {
          throw new Error('Uploaded bytes are unavailable for processing.');
        }
        const originalParsedData = await parsePdfInWorker(next.id, uploadedBytes);
        const sourceAssessment = classifyPdfSource(next.name, originalParsedData);
        const remediationSourceBytes = uploadedBytes;
        let remediationParsedData = originalParsedData;
        let ocrAttempted = false;
        let ocrApplied = false;
        let ocrTextLayerApplied = false;
        let ocrReason: string | undefined;

        if (isLikelyScannedPdf(originalParsedData)) {
          ocrAttempted = true;
          updateFile(next.id, { status: 'ocr', progress: 30 });
          const { runTritonAiOcr } = await import('@/lib/ocr/tritonai');
          const tritonOcr = await runTritonAiOcr(
            remediationParsedData,
            remediationSourceBytes,
            next.name,
            remediationParsedData.language
          );
          let upstreamOcrFailureReason = tritonOcr.reason;

          if (tritonOcr.applied && tritonOcr.parsed) {
            const tritonAssessment = assessOcrTextGain(originalParsedData, tritonOcr.parsed);
            if (tritonAssessment.accepted) {
              remediationParsedData = tritonOcr.parsed;
              ocrApplied = true;
              ocrTextLayerApplied = true;
              ocrReason = 'Used TritonAI OCR';
              upstreamOcrFailureReason = undefined;
            } else {
              upstreamOcrFailureReason = [upstreamOcrFailureReason, tritonAssessment.reason].filter(Boolean).join('; ') || undefined;
            }
          }

          if (!ocrApplied) {
            const { runLocalOcr } = await import('@/lib/ocr/local');
            const localOcr = await runLocalOcr(
              remediationParsedData,
              remediationSourceBytes,
              remediationParsedData.language
            );
            if (localOcr.applied && localOcr.parsed) {
              remediationParsedData = localOcr.parsed;
              ocrApplied = true;
              ocrTextLayerApplied = true;
              ocrReason = upstreamOcrFailureReason ? `${upstreamOcrFailureReason}; used local OCR fallback` : 'Used local OCR fallback';
            } else {
              ocrReason = upstreamOcrFailureReason ?? localOcr.reason;
            }
          }
        }

        updateFile(next.id, {
          status: 'auditing',
          progress: 45,
          parsedData: originalParsedData,
          sourceType: sourceAssessment.type,
          sourceTypeConfidence: sourceAssessment.confidence,
          sourceTypeReasons: sourceAssessment.reasons,
          sourceTypeSuggestedAction: sourceAssessment.suggestedAction,
          ocrAttempted,
          ocrApplied,
          ocrReason
        });
        const auditResult = await runAuditInWorker(next.id, originalParsedData);

        updateFile(next.id, { status: 'remediating', progress: 75, auditResult });

        const remediationIterations: RemediationIterationSummary[] = [];
        const remediationIterationArtifacts: RemediationIterationArtifact[] = [];
        let remediationStopReason: RemediationStopReason = 'max_iterations';
        let previousFingerprint: string | undefined;
        let previousFailureScore: number | undefined;
        let latestVerapdfResult: VerapdfResult | undefined;
        let currentSourceBytes = remediationSourceBytes;
        let currentParsedData = remediationParsedData;

        for (let iteration = 1; iteration <= MAX_REMEDIATION_ITERATIONS; iteration += 1) {
          const remediatedBytes = await remediatePdfInWorker({
            fileId: `${next.id}-${iteration}`,
            parsed: currentParsedData,
            language: currentParsedData.language ?? originalParsedData.language ?? 'en-US',
            sourceBytes: currentSourceBytes,
            options: {
              addInvisibleTextLayer: ocrTextLayerApplied,
              strictPdfUa: iteration > 1,
              verapdfFeedback: latestVerapdfResult
            }
          });
          const remediatedParsedData = await parsePdfInWorker(`${next.id}-${iteration}`, remediatedBytes);
          const postRemediationAudit = await runAuditInWorker(`${next.id}-${iteration}`, remediatedParsedData);

          updateFile(next.id, {
            status: 'remediating',
            progress: 78 + Math.round((iteration / MAX_REMEDIATION_ITERATIONS) * 16),
            postRemediationAudit
          });

          const verapdfResult = await runVerapdfViaApi(remediatedBytes, `remediated-${next.name}`);
          const failureScore = computeFailureScore(verapdfResult);
          const fingerprint = createByteFingerprint(remediatedBytes);
          remediationIterations.push({
            iteration,
            internalScore: postRemediationAudit.score,
            verapdfCompliant: getVerapdfComplianceVerdict(verapdfResult),
            failedRules: verapdfResult.summary?.failedRules,
            failedChecks: verapdfResult.summary?.failedChecks
          });
          remediationIterationArtifacts.push({
            iteration,
            internalScore: postRemediationAudit.score,
            failureScore,
            remediationMode: remediationModeForParsed(remediatedParsedData),
            remediatedParsedData,
            verapdfResult,
            remediatedBytes,
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
          currentSourceBytes = remediatedBytes;
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
        const completedAt = new Date().toISOString();

        updateFile(next.id, {
          status: 'remediated',
          progress: 100,
          ocrAttempted,
          ocrApplied,
          ocrReason,
          remediatedBytes: selectedArtifact.remediatedBytes,
          remediatedParsedData: selectedArtifact.remediatedParsedData,
          postRemediationAudit: selectedArtifact.postRemediationAudit,
          remediationMode: selectedArtifact.remediationMode,
          remediationCompletedAt: completedAt,
          validationCompletedAt: completedAt,
          verapdfResult: selectedArtifact.verapdfResult,
          remediationIterations,
          remediationStopReason
        });
        // Release the original uploaded bytes from memory now that remediation is
        // complete.  They remain in IndexedDB and can be lazy-loaded if the user
        // views the "Uploaded PDF" side in the comparison viewer.
        releaseUploadedBytes(next.id);
      } catch (error) {
        updateFile(next.id, {
          status: 'error',
          progress: 100,
          error: friendlyProcessingError(error)
        });
      } finally {
        processing.current.delete(next.id);
        // Trigger a re-render so the effect picks up the next queued file.
      }
    })();
  }, [files, hydrated, updateFile, releaseUploadedBytes, ensureUploadedBytes]);

  return null;
}
