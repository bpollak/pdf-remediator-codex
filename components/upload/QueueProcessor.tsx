'use client';

import { useEffect } from 'react';
import type { AuditResult } from '@/lib/audit/types';
import { classifyPdfSource } from '@/lib/pdf/source-type';
import type { ParsedPDF, RemediationMode } from '@/lib/pdf/types';
import { assessOcrTextGain, isLikelyScannedPdf } from '@/lib/ocr/detection';
import {
  MAX_REMEDIATION_ITERATIONS,
  computeFailureScore,
  createRemediationFingerprint,
  decideRemediationLoop,
  selectBestRemediationIteration,
  type RemediationIterationSummary,
  type RemediationStopReason
} from '@/lib/remediate/loop';
import { runVerapdfViaApi } from '@/lib/verapdf/client';
import { CLIENT_VERAPDF_TIMEOUT_MS } from '@/lib/verapdf/config';
import type { VerapdfResult } from '@/lib/verapdf/types';
import { getVerapdfComplianceVerdict } from '@/lib/verapdf/result';
import { StepTimeoutError, isAbortError, withDeadline } from '@/lib/client/deadline';
import { ProcessingFailureError, describeProcessingFailure, tooManyPagesMessage } from '@/lib/client/error-copy';
import { MAX_PAGES_PER_FILE } from '@/lib/client/page-limits';
import { isQueueLeader, onQueueLeadershipChange, requestQueueLeadership } from '@/lib/client/tab-sync';
import { MID_PROCESSING_STATUSES, useAppStore } from '@/stores/app-store';
import type { FileEntry } from '@/types/file-entry';
import { parsePdfInWorker, remediatePdfInWorker, runAuditInWorker } from '@/lib/workers/client';

// Every step has a deadline, so one stalled step can't hold the queue. Work
// that can't be interrupted keeps running in the background, but the queue
// moves on and the file shows an error with Try again.
export const PAGE_COUNT_TIMEOUT_MS = 30_000;
export const PARSE_TIMEOUT_MS = 5 * 60_000;
export const AUDIT_TIMEOUT_MS = 2 * 60_000;
/** One remediation pass: write the PDF, read it back and audit it. */
export const REMEDIATION_PASS_TIMEOUT_MS = 5 * 60_000;
export const TRITON_OCR_TIMEOUT_MS = 10 * 60_000;
export const LOCAL_OCR_TIMEOUT_MS = 10 * 60_000;
// Two attempts at the client timeout plus the retry backoff.
const VERAPDF_STEP_TIMEOUT_MS = CLIENT_VERAPDF_TIMEOUT_MS * 2 + 10_000;

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

// One file at a time, across the whole app and across tabs (only the tab
// holding the queue lock runs jobs). The lock lives at module level so it
// survives navigation between the upload page and result pages; it is
// released when the running job settles, is cancelled, or its file is removed.
interface ActiveJob {
  fileId: string;
  controller: AbortController;
}
let activeJob: ActiveJob | null = null;
let runtimeStarted = false;

class FileRemovedError extends Error {}

function assertStillQueued(fileId: string, signal: AbortSignal): void {
  if (signal.aborted || !useAppStore.getState().files.some((file) => file.id === fileId)) {
    throw new FileRemovedError('File was removed during processing.');
  }
}

/** Run a step with its own deadline; on timeout or cancel, its signal aborts too. */
async function runStep<T>(
  step: string,
  timeoutMs: number,
  jobSignal: AbortSignal,
  run: (stepSignal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const onJobAbort = () => controller.abort();
  jobSignal.addEventListener('abort', onJobAbort, { once: true });
  try {
    return await withDeadline(run(controller.signal), { step, timeoutMs, signal: jobSignal });
  } finally {
    controller.abort();
    jobSignal.removeEventListener('abort', onJobAbort);
  }
}

function startQueueRuntime(): void {
  if (runtimeStarted) return;
  runtimeStarted = true;

  // Remove (or Clear all) cancels the running job: its fetches abort and
  // every step after the current one is skipped.
  useAppStore.subscribe((state) => {
    if (activeJob && !state.files.some((file) => file.id === activeJob?.fileId)) {
      activeJob.controller.abort();
    }
  });

  onQueueLeadershipChange(({ leader, waitingForOtherTab }) => {
    useAppStore.getState().setProcessingInOtherTab(!leader && waitingForOtherTab);
    if (leader) queueMicrotask(pumpQueue);
  });
  requestQueueLeadership();
}

async function processFile(next: FileEntry, signal: AbortSignal): Promise<void> {
  const { updateFile, releaseUploadedBytes, ensureUploadedBytes, beginProcessing } = useAppStore.getState();

  // Saved before any heavy work: if this file crashes the tab, the reload
  // shows it as interrupted instead of starting it again.
  await beginProcessing(next.id);
  assertStillQueued(next.id, signal);
  // Bytes may have been released from memory; reload from IndexedDB if needed.
  const uploadedBytes = next.uploadedBytes ?? await ensureUploadedBytes(next.id);
  if (!uploadedBytes) {
    throw new ProcessingFailureError({
      code: 'original_unavailable',
      message: 'The original PDF is no longer saved in this browser. Upload it again.'
    });
  }

  const { readPdfPageCount } = await import('@/lib/client/page-count');
  const pageCount = await withDeadline(readPdfPageCount(uploadedBytes), {
    step: 'Counting pages',
    timeoutMs: PAGE_COUNT_TIMEOUT_MS,
    signal
  }).catch((error: unknown) => {
    if (isAbortError(error)) throw error;
    // The full parse below reports unreadable files properly.
    return undefined;
  });
  assertStillQueued(next.id, signal);
  if (pageCount !== undefined) {
    if (pageCount > MAX_PAGES_PER_FILE) {
      throw new ProcessingFailureError({ code: 'too_many_pages', message: tooManyPagesMessage(pageCount, MAX_PAGES_PER_FILE) });
    }
    updateFile(next.id, { pageCount });
  }

  const originalParsedData = await runStep('Reading the PDF', PARSE_TIMEOUT_MS, signal, () =>
    parsePdfInWorker(next.id, uploadedBytes)
  );
  assertStillQueued(next.id, signal);
  const sourceAssessment = classifyPdfSource(next.name, originalParsedData);
  const remediationSourceBytes = uploadedBytes;
  let remediationParsedData = originalParsedData;
  let ocrAttempted = false;
  let ocrApplied = false;
  let ocrTextLayerApplied = false;
  let ocrReason: string | undefined;
  let ocrCoverage: FileEntry['ocrCoverage'];

  if (isLikelyScannedPdf(originalParsedData)) {
    ocrAttempted = true;
    updateFile(next.id, { status: 'ocr', progress: 30 });
    const { runTritonAiOcr } = await import('@/lib/ocr/tritonai');
    const tritonOcr = await runStep('TritonAI OCR', TRITON_OCR_TIMEOUT_MS, signal, (stepSignal) =>
      runTritonAiOcr(remediationParsedData, remediationSourceBytes, next.name, remediationParsedData.language, {
        signal: stepSignal
      })
    ).catch((error: unknown) => {
      if (!(error instanceof StepTimeoutError)) throw error;
      return { attempted: true, applied: false, parsed: undefined, reason: 'TritonAI OCR took too long', pagesProcessed: 0, totalPages: originalParsedData.pageCount };
    });
    assertStillQueued(next.id, signal);
    let upstreamOcrFailureReason = tritonOcr.reason;
    ocrCoverage = { pagesProcessed: tritonOcr.pagesProcessed, totalPages: tritonOcr.totalPages };

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
      const localOcr = await runStep('Local OCR', LOCAL_OCR_TIMEOUT_MS, signal, (stepSignal) =>
        runLocalOcr(remediationParsedData, remediationSourceBytes, remediationParsedData.language, { signal: stepSignal })
      ).catch((error: unknown) => {
        if (!(error instanceof StepTimeoutError)) throw error;
        return { attempted: true, applied: false, parsed: undefined, reason: 'Local OCR took too long', pagesProcessed: 0, totalPages: originalParsedData.pageCount };
      });
      assertStillQueued(next.id, signal);
      if (localOcr.applied && localOcr.parsed) {
        remediationParsedData = localOcr.parsed;
        ocrApplied = true;
        ocrTextLayerApplied = true;
        ocrReason = upstreamOcrFailureReason ? `${upstreamOcrFailureReason}; used local OCR fallback` : 'Used local OCR fallback';
        ocrCoverage = { pagesProcessed: localOcr.pagesProcessed, totalPages: localOcr.totalPages };
      } else {
        ocrReason = upstreamOcrFailureReason ?? localOcr.reason;
        if (localOcr.pagesProcessed > ocrCoverage.pagesProcessed) {
          ocrCoverage = { pagesProcessed: localOcr.pagesProcessed, totalPages: localOcr.totalPages };
        }
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
    ocrReason,
    ocrCoverage
  });
  const auditResult = await runStep('Checking accessibility', AUDIT_TIMEOUT_MS, signal, () =>
    runAuditInWorker(next.id, originalParsedData)
  );
  assertStillQueued(next.id, signal);

  updateFile(next.id, { status: 'remediating', progress: 75, auditResult });

  const remediationIterations: RemediationIterationSummary[] = [];
  // Only the best pass so far is kept, not every pass: each holds a full PDF
  // and its parse.
  let bestArtifact: RemediationIterationArtifact | undefined;
  let remediationStopReason: RemediationStopReason = 'max_iterations';
  let previousFingerprint: string | undefined;
  let previousFailureScore: number | undefined;
  let latestVerapdfResult: VerapdfResult | undefined;
  let currentSourceBytes = remediationSourceBytes;
  let currentParsedData = remediationParsedData;

  for (let iteration = 1; iteration <= MAX_REMEDIATION_ITERATIONS; iteration += 1) {
    const passSourceBytes = currentSourceBytes;
    const passParsedData = currentParsedData;
    const passFeedback = latestVerapdfResult;
    const { remediatedBytes, remediatedParsedData, postRemediationAudit } = await runStep(
      'Applying fixes',
      REMEDIATION_PASS_TIMEOUT_MS,
      signal,
      async (stepSignal) => {
        const bytes = await remediatePdfInWorker({
          fileId: `${next.id}-${iteration}`,
          parsed: passParsedData,
          language: passParsedData.language ?? originalParsedData.language ?? 'en-US',
          sourceBytes: passSourceBytes,
          options: {
            addInvisibleTextLayer: ocrTextLayerApplied,
            strictPdfUa: iteration > 1,
            verapdfFeedback: passFeedback
          }
        });
        if (stepSignal.aborted) throw new FileRemovedError('Step cancelled.');
        const parsed = await parsePdfInWorker(`${next.id}-${iteration}`, bytes);
        if (stepSignal.aborted) throw new FileRemovedError('Step cancelled.');
        const audit = await runAuditInWorker(`${next.id}-${iteration}`, parsed);
        return { remediatedBytes: bytes, remediatedParsedData: parsed, postRemediationAudit: audit };
      }
    );
    assertStillQueued(next.id, signal);

    updateFile(next.id, {
      status: 'remediating',
      progress: 78 + Math.round((iteration / MAX_REMEDIATION_ITERATIONS) * 16),
      postRemediationAudit
    });

    const verapdfResult = await runStep('Verifying PDF/UA', VERAPDF_STEP_TIMEOUT_MS, signal, (stepSignal) =>
      runVerapdfViaApi(remediatedBytes, `remediated-${next.name}`, { signal: stepSignal })
    ).catch((error: unknown): VerapdfResult => {
      if (!(error instanceof StepTimeoutError)) throw error;
      return { attempted: false, reason: 'Online PDF/UA verification timed out.' };
    });
    assertStillQueued(next.id, signal);
    const failureScore = computeFailureScore(verapdfResult);
    const fingerprint = await createRemediationFingerprint(remediatedParsedData);
    remediationIterations.push({
      iteration,
      internalScore: postRemediationAudit.score,
      verapdfCompliant: getVerapdfComplianceVerdict(verapdfResult),
      failedRules: verapdfResult.summary?.failedRules,
      failedChecks: verapdfResult.summary?.failedChecks
    });
    const artifact: RemediationIterationArtifact = {
      iteration,
      internalScore: postRemediationAudit.score,
      failureScore,
      remediationMode: remediationModeForParsed(remediatedParsedData),
      remediatedParsedData,
      verapdfResult,
      remediatedBytes,
      postRemediationAudit
    };
    const preferred = selectBestRemediationIteration(bestArtifact ? [bestArtifact, artifact] : [artifact], auditResult.score);
    if (preferred?.iteration === artifact.iteration) bestArtifact = artifact;

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

  if (!bestArtifact) {
    throw new Error('Remediation loop did not produce a remediated artifact.');
  }
  const completedAt = new Date().toISOString();

  updateFile(next.id, {
    status: 'remediated',
    progress: 100,
    ocrAttempted,
    ocrApplied,
    ocrReason,
    ocrCoverage,
    remediatedBytes: bestArtifact.remediatedBytes,
    remediatedParsedData: bestArtifact.remediatedParsedData,
    postRemediationAudit: bestArtifact.postRemediationAudit,
    remediationMode: bestArtifact.remediationMode,
    remediationCompletedAt: completedAt,
    validationCompletedAt: completedAt,
    verapdfResult: bestArtifact.verapdfResult,
    remediationIterations,
    remediationStopReason
  });
  // Release the original uploaded bytes from memory now that remediation is
  // complete.  They remain in IndexedDB and can be lazy-loaded if the user
  // views the "Uploaded PDF" side in the comparison viewer.
  releaseUploadedBytes(next.id);
}

export function pumpQueue(): void {
  startQueueRuntime();
  const { files, hydrated, markInterrupted } = useAppStore.getState();
  // A removed file's job may still be awaiting a step; cancel it and don't let it hold the lock.
  if (activeJob && !files.some((file) => file.id === activeJob?.fileId)) {
    activeJob.controller.abort();
    activeJob = null;
  }
  // Another tab runs the queue; files here wait until it closes.
  if (!hydrated || !isQueueLeader()) return;

  // This tab runs the queue, so a file still marked mid-processing that isn't
  // its own job was left by a tab that closed or crashed.
  const orphanedIds = files
    .filter((file) => MID_PROCESSING_STATUSES.has(file.status) && file.id !== activeJob?.fileId)
    .map((file) => file.id);
  if (orphanedIds.length > 0) markInterrupted(orphanedIds);

  if (activeJob) return;
  const next = useAppStore.getState().files.find((file) => file.status === 'queued');
  if (!next) return;

  const job: ActiveJob = { fileId: next.id, controller: new AbortController() };
  activeJob = job;

  (async () => {
    try {
      await processFile(next, job.controller.signal);
    } catch (error) {
      if (error instanceof FileRemovedError || job.controller.signal.aborted) return;
      const failure = describeProcessingFailure(error);
      useAppStore.getState().updateFile(next.id, {
        status: 'error',
        progress: 100,
        error: failure.message,
        errorCode: failure.code,
        errorDetail: failure.detail
      });
    } finally {
      if (activeJob === job) activeJob = null;
      // Pick up the next queued file, whether or not any page is mounted.
      queueMicrotask(pumpQueue);
    }
  })();
}

export function QueueProcessor() {
  const files = useAppStore((s) => s.files);
  const hydrated = useAppStore((s) => s.hydrated);

  useEffect(() => {
    pumpQueue();
  }, [files, hydrated]);

  return null;
}
