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
/** Stable category of a processing failure; decides the card copy and whether Try again is offered. */
export type ProcessingErrorCode =
  | 'interrupted'
  | 'too_many_pages'
  | 'password_protected'
  | 'signed'
  | 'unreadable'
  | 'timed_out'
  | 'original_unavailable'
  | 'failed';

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
  /** Set when manual structure drafts (tables, headings) change. */
  structurePreparedAt?: string;
  /** Set only when the user ticks "Fix document structure in Acrobat or PAC" as done. */
  structureConfirmedAt?: string;
  /** When the user marked each required checklist item done, keyed by item id. */
  checklistItemsDoneAt?: Record<string, string>;
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
  /** When the file was added to this browser. */
  createdAt?: string;
  /**
   * Set when processing starts and persisted before the heavy work, so a tab
   * that crashed mid-run is detected on reload instead of being restarted.
   */
  processingStartedAt?: string;
  /** How many times processing has started for this file. */
  processingAttempts?: number;
  /** Page count read before the full parse. */
  pageCount?: number;
  /** Set when saving to browser storage fails; not persisted. */
  persistError?: string;
  /** Whether the original upload is in browser storage. Not persisted; derived on load. */
  uploadedBytesStored?: boolean;
  /** Whether the remediated PDF is in browser storage. Not persisted; derived on load. */
  remediatedBytesStored?: boolean;
  ocrAttempted?: boolean;
  ocrApplied?: boolean;
  ocrReason?: string;
  /** Pages OCR read, out of the document's pages. Set whenever OCR ran (TritonAI or local). */
  ocrCoverage?: { pagesProcessed: number; totalPages: number };
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
  /** Plain-language message for the user. */
  error?: string;
  errorCode?: ProcessingErrorCode;
  /** Raw diagnostic, shown only behind "Details for support". */
  errorDetail?: string;
}
