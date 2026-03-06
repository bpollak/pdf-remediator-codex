import type { ParsedPDF, RemediationMode } from '@/lib/pdf/types';
import type { AuditResult } from '@/lib/audit/types';
import type { VerapdfResult } from '@/lib/verapdf/types';
import type { RemediationIterationSummary, RemediationStopReason } from '@/lib/remediate/loop';
import type { SourceType, SourceTypeConfidence } from '@/lib/pdf/source-type';

export interface FileEntry {
  id: string;
  name: string;
  size: number;
  uploadedBytes: ArrayBuffer;
  status: 'queued' | 'parsing' | 'ocr' | 'auditing' | 'audited' | 'remediating' | 'remediated' | 'error';
  progress: number;
  ocrAttempted?: boolean;
  ocrApplied?: boolean;
  ocrReason?: string;
  parsedData?: ParsedPDF;
  remediatedParsedData?: ParsedPDF;
  auditResult?: AuditResult;
  remediatedBytes?: ArrayBuffer;
  postRemediationAudit?: AuditResult;
  remediationMode?: RemediationMode;
  sourceType?: SourceType;
  sourceTypeConfidence?: SourceTypeConfidence;
  sourceTypeReasons?: string[];
  sourceTypeSuggestedAction?: string;
  verapdfResult?: VerapdfResult;
  remediationIterations?: RemediationIterationSummary[];
  remediationStopReason?: RemediationStopReason;
  error?: string;
}
