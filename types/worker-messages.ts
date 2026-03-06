import type { ParsedPDF } from '@/lib/pdf/types';
import type { AuditResult } from '@/lib/audit/types';
import type { RemediationOptions } from '@/lib/remediate/engine';

export type ParseWorkerRequest = { type: 'parse'; fileId: string; bytes: ArrayBuffer };
export type ParseWorkerResponse =
  | { type: 'progress'; fileId: string; progress: number; label: string }
  | { type: 'parsed'; fileId: string; parsed: ParsedPDF }
  | { type: 'error'; fileId: string; error: string };

export type AuditWorkerRequest = { type: 'audit'; fileId: string; parsed: ParsedPDF };
export type AuditWorkerResponse =
  | { type: 'progress'; fileId: string; progress: number; label: string }
  | { type: 'audited'; fileId: string; result: AuditResult }
  | { type: 'error'; fileId: string; error: string };

export type RemediateWorkerRequest = {
  type: 'remediate';
  fileId: string;
  parsed: ParsedPDF;
  language?: string;
  sourceBytes?: ArrayBuffer;
  options?: RemediationOptions;
};

export type RemediateWorkerResponse =
  | { type: 'progress'; fileId: string; progress: number; label: string }
  | { type: 'remediated'; fileId: string; bytes: ArrayBuffer }
  | { type: 'error'; fileId: string; error: string };
