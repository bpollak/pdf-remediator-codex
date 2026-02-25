'use client';

import { create } from 'zustand';
import type { ParsedPDF } from '@/lib/pdf/types';
import type { AuditResult } from '@/lib/audit/types';
import type { VerapdfResult } from '@/lib/verapdf/types';
import type { RemediationIterationSummary, RemediationStopReason } from '@/lib/remediate/loop';
import type { RemediationMode } from '@/lib/pdf/types';
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

interface AppStore {
  files: FileEntry[];
  addFiles: (files: File[]) => Promise<void>;
  updateFile: (id: string, patch: Partial<FileEntry>) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  files: [],
  addFiles: async (files) => {
    const entries = await Promise.all(
      files.slice(0, 10).map(async (file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        uploadedBytes: await file.arrayBuffer(),
        status: 'queued' as const,
        progress: 0
      }))
    );

    set((state) => ({ files: [...state.files, ...entries] }));
  },
  updateFile: (id, patch) => set((state) => ({ files: state.files.map((f) => (f.id === id ? { ...f, ...patch } : f)) }))
}));
