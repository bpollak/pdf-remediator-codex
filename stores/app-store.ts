'use client';

import { create } from 'zustand';
import type { ParsedPDF } from '@/lib/pdf/types';
import type { AuditResult } from '@/lib/audit/types';

export interface FileEntry {
  id: string;
  name: string;
  size: number;
  originalBytes: ArrayBuffer;
  status: 'queued' | 'parsing' | 'auditing' | 'audited' | 'remediating' | 'remediated' | 'error';
  progress: number;
  parsedData?: ParsedPDF;
  auditResult?: AuditResult;
  remediatedBytes?: ArrayBuffer;
  postRemediationAudit?: AuditResult;
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
        originalBytes: await file.arrayBuffer(),
        status: 'queued' as const,
        progress: 0
      }))
    );

    set((state) => ({ files: [...state.files, ...entries] }));
  },
  updateFile: (id, patch) => set((state) => ({ files: state.files.map((f) => (f.id === id ? { ...f, ...patch } : f)) }))
}));
