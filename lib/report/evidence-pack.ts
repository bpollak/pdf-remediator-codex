import { createByteFingerprint } from '@/lib/remediate/loop';
import { computeDisplayedAutomatedScore } from '@/lib/report/display-score';
import type { FileEntry } from '@/stores/app-store';

function summarizeFindings(file: FileEntry, variant: 'original' | 'remediated') {
  const findings = variant === 'original' ? file.auditResult?.findings ?? [] : file.postRemediationAudit?.findings ?? [];
  return findings.map((finding) => ({
    ruleId: finding.ruleId,
    category: finding.category,
    severity: finding.severity,
    description: finding.description,
    location: finding.location,
    recommendation: finding.recommendation,
    wcagCriterion: finding.wcagCriterion,
    autoFixable: finding.autoFixable
  }));
}

function summarizeStructure(file: FileEntry, variant: 'original' | 'remediated') {
  const parsed = variant === 'original' ? file.parsedData : file.remediatedParsedData;
  if (!parsed) return undefined;
  return {
    hasStructTree: parsed.hasStructTree,
    remediationMode: variant === 'remediated' ? file.remediationMode : undefined,
    structureBinding: parsed.structureBinding ?? null
  };
}

export function buildEvidencePack(file: FileEntry) {
  const originalDisplayedScore = computeDisplayedAutomatedScore({
    auditResult: file.auditResult,
    variant: 'original'
  });
  const remediatedDisplayedScore = computeDisplayedAutomatedScore({
    auditResult: file.postRemediationAudit,
    variant: 'remediated',
    verapdfResult: file.verapdfResult
  });

  return {
    generatedAt: new Date().toISOString(),
    document: {
      id: file.id,
      name: file.name,
      sizeBytes: file.size,
      uploadedFingerprint: createByteFingerprint(file.uploadedBytes),
      remediatedFingerprint: file.remediatedBytes ? createByteFingerprint(file.remediatedBytes) : undefined
    },
    sourceAssessment: {
      sourceType: file.sourceType,
      confidence: file.sourceTypeConfidence,
      reasons: file.sourceTypeReasons ?? [],
      suggestedAction: file.sourceTypeSuggestedAction
    },
    processing: {
      status: file.status,
      ocrAttempted: file.ocrAttempted ?? false,
      ocrApplied: file.ocrApplied ?? false,
      ocrReason: file.ocrReason,
      remediationMode: file.remediationMode,
      remediationIterations: file.remediationIterations ?? [],
      remediationStopReason: file.remediationStopReason
    },
    scoring: {
      originalInternalScore: file.auditResult?.score,
      originalDisplayedScore,
      remediatedInternalScore: file.postRemediationAudit?.score,
      remediatedDisplayedScore
    },
    findings: {
      original: summarizeFindings(file, 'original'),
      remediated: summarizeFindings(file, 'remediated')
    },
    structure: {
      original: summarizeStructure(file, 'original'),
      remediated: summarizeStructure(file, 'remediated')
    },
    verification: file.verapdfResult ?? null
  };
}
