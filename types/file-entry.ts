import type { ParsedPDF, RemediationMode } from '@/lib/pdf/types';
import type { AuditResult } from '@/lib/audit/types';
import type { VerapdfResult } from '@/lib/verapdf/types';
import type { RemediationIterationSummary, RemediationStopReason } from '@/lib/remediate/loop';
import type { SourceType, SourceTypeConfidence } from '@/lib/pdf/source-type';

export type ManualStructureTableDecision = 'confirm' | 'reject' | 'review';
export type ManualCustomElementCategory =
  | 'alt-text'
  | 'structure'
  | 'reading-order'
  | 'table'
  | 'form-field'
  | 'metadata'
  | 'other';
export type ManualCustomElementStatus = 'todo' | 'done';
export type UploadIntent = 'new-upload' | 'revalidation';

export interface ManualAltTextDraft {
  alt: string;
  decorative: boolean;
}

export interface ManualStructureHeadingDraft {
  include?: boolean;
  level?: number;
}

export interface ManualStructureDrafts {
  headings: Record<string, ManualStructureHeadingDraft>;
  headingOrder: string[];
  tableDecisions: Record<string, ManualStructureTableDecision>;
}

export interface ManualCustomElementDraft {
  id: string;
  title: string;
  category: ManualCustomElementCategory;
  status: ManualCustomElementStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ManualReviewDrafts {
  altText: Record<string, ManualAltTextDraft>;
  structure: ManualStructureDrafts;
  customElements: ManualCustomElementDraft[];
  lastUpdatedAt?: string;
}

export interface WorkflowProgress {
  downloadedAt?: string;
  reviewedAt?: string;
  altTextPreparedAt?: string;
  structurePreparedAt?: string;
}

export interface FileEntry {
  id: string;
  name: string;
  size: number;
  /** May be undefined after memory release; reload via loadAssetBytes(). */
  uploadedBytes?: ArrayBuffer;
  uploadIntent?: UploadIntent;
  derivedFromFileId?: string;
  status: 'queued' | 'parsing' | 'ocr' | 'auditing' | 'audited' | 'remediating' | 'remediated' | 'error';
  progress: number;
  /** Set when processing starts; not persisted. Used to surface long-running-work hints. */
  processingStartedAt?: string;
  ocrAttempted?: boolean;
  ocrApplied?: boolean;
  ocrReason?: string;
  parsedData?: ParsedPDF;
  remediatedParsedData?: ParsedPDF;
  auditResult?: AuditResult;
  remediatedBytes?: ArrayBuffer;
  postRemediationAudit?: AuditResult;
  remediationMode?: RemediationMode;
  remediationCompletedAt?: string;
  validationCompletedAt?: string;
  sourceType?: SourceType;
  sourceTypeConfidence?: SourceTypeConfidence;
  sourceTypeReasons?: string[];
  sourceTypeSuggestedAction?: string;
  verapdfResult?: VerapdfResult;
  remediationIterations?: RemediationIterationSummary[];
  remediationStopReason?: RemediationStopReason;
  manualReviewDrafts?: ManualReviewDrafts;
  workflowProgress?: WorkflowProgress;
  error?: string;
}
