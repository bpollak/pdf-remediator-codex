'use client';

import { useEffect, useRef } from 'react';
import type { AuditResult } from '@/lib/audit/types';
import { classifyPdfSource } from '@/lib/pdf/source-type';
import type { ParsedPDF, RemediationMode } from '@/lib/pdf/types';
import { runOcrViaApi } from '@/lib/ocr/client';
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

export function QueueProcessor() {
  const files = useAppStore((s) => s.files);
  const hydrated = useAppStore((s) => s.hydrated);
  const updateFile = useAppStore((s) => s.updateFile);
  const processing = useRef(new Set<string>());

  useEffect(() => {
    if (!hydrated) return;
    if (processing.current.size > 0) return;
    const next = files.find((file) => file.status === 'queued' && !processing.current.has(file.id));
    if (!next) return;

    processing.current.add(next.id);

    (async () => {
      try {
        updateFile(next.id, { status: 'parsing', progress: 10 });
        const uploadedBytes = next.uploadedBytes;
        const originalParsedData = await parsePdfInWorker(next.id, uploadedBytes);
        const sourceAssessment = classifyPdfSource(next.name, originalParsedData);
        let remediationSourceBytes = uploadedBytes;
        let remediationParsedData = originalParsedData;
        let ocrAttempted = false;
        let ocrApplied = false;
        let localOcrApplied = false;
        let ocrReason: string | undefined;

        if (isLikelyScannedPdf(originalParsedData)) {
          ocrAttempted = true;
          updateFile(next.id, { status: 'ocr', progress: 30 });
          const ocrResult = await runOcrViaApi(remediationSourceBytes, next.name, originalParsedData.language);
          let upstreamOcrFailureReason = ocrResult.reason;

          if (ocrResult.bytes) {
            try {
              const candidateParsed = await parsePdfInWorker(`${next.id}-ocr`, ocrResult.bytes);
              const candidateAssessment = assessOcrTextGain(originalParsedData, candidateParsed);

              if (candidateAssessment.accepted) {
                remediationSourceBytes = ocrResult.bytes;
                remediationParsedData = candidateParsed;
                ocrApplied = true;
                ocrReason = undefined;
                upstreamOcrFailureReason = undefined;
              } else {
                upstreamOcrFailureReason = candidateAssessment.reason;
              }
            } catch (error) {
              upstreamOcrFailureReason =
                error instanceof Error ? `OCR output could not be parsed (${error.message})` : 'OCR output could not be parsed';
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
              localOcrApplied = true;
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
              addInvisibleTextLayer: localOcrApplied,
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
  }, [files, hydrated, updateFile]);

  return null;
}
