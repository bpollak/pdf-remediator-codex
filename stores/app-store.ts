'use client';

import { create } from 'zustand';
import { loadPersistedFiles, saveFileEntry } from '@/lib/persistence/file-store';
import type { FileEntry } from '@/types/file-entry';

export type { FileEntry } from '@/types/file-entry';

interface AppStore {
  files: FileEntry[];
  hydrated: boolean;
  hydrateFromPersistence: () => Promise<void>;
  addFiles: (files: File[]) => Promise<void>;
  updateFile: (id: string, patch: Partial<FileEntry>) => void;
}

const NON_PERSISTED_STATUSES = new Set<FileEntry['status']>(['queued', 'parsing', 'ocr', 'auditing', 'audited', 'remediating']);

function normalizePersistedFile(file: FileEntry): FileEntry {
  if (!NON_PERSISTED_STATUSES.has(file.status)) return file;
  return {
    ...file,
    status: 'queued',
    progress: 0,
    error: undefined
  };
}

function shouldPersistPatch(patch: Partial<FileEntry>): boolean {
  if ('uploadedBytes' in patch || 'remediatedBytes' in patch) return true;
  if ('parsedData' in patch || 'remediatedParsedData' in patch) return true;
  if ('auditResult' in patch || 'postRemediationAudit' in patch) return true;
  if ('sourceType' in patch || 'sourceTypeConfidence' in patch || 'sourceTypeReasons' in patch || 'sourceTypeSuggestedAction' in patch) {
    return true;
  }
  if ('ocrAttempted' in patch || 'ocrApplied' in patch || 'ocrReason' in patch) return true;
  if ('remediationMode' in patch || 'verapdfResult' in patch) return true;
  if ('remediationIterations' in patch || 'remediationStopReason' in patch) return true;
  if ('error' in patch) return true;
  if (patch.status === 'remediated' || patch.status === 'error') return true;
  return false;
}

export const useAppStore = create<AppStore>((set, get) => ({
  files: [],
  hydrated: false,
  hydrateFromPersistence: async () => {
    if (get().hydrated || typeof window === 'undefined') return;

    try {
      const persistedFiles = await loadPersistedFiles();
      set((state) => {
        const seenIds = new Set(state.files.map((file) => file.id));
        const hydratedFiles = persistedFiles
          .filter((file) => !seenIds.has(file.id))
          .map((file) => normalizePersistedFile(file));

        return {
          files: [...hydratedFiles, ...state.files],
          hydrated: true
        };
      });
    } catch {
      set({ hydrated: true });
    }
  },
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

    set((state) => ({ files: [...state.files, ...entries], hydrated: true }));
    void Promise.all(entries.map((entry) => saveFileEntry(entry))).catch(() => undefined);
  },
  updateFile: (id, patch) => {
    let updatedEntry: FileEntry | undefined;

    set((state) => {
      const nextFiles = state.files.map((file) => {
        if (file.id !== id) return file;
        const nextEntry = { ...file, ...patch } satisfies FileEntry;
        updatedEntry = nextEntry;
        return nextEntry;
      });

      return { files: nextFiles };
    });

    if (updatedEntry && shouldPersistPatch(patch)) {
      void saveFileEntry(updatedEntry).catch(() => undefined);
    }
  }
}));
