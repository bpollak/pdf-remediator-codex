'use client';

import { create } from 'zustand';
import { loadPersistedFiles, saveFileEntry } from '@/lib/persistence/file-store';
import type {
  FileEntry,
  ManualAltTextDraft,
  ManualReviewDrafts,
  ManualStructureTableDecision
} from '@/types/file-entry';

export type { FileEntry } from '@/types/file-entry';
export type { ManualStructureTableDecision } from '@/types/file-entry';

export interface PreviewFocus {
  variant?: 'original' | 'remediated';
  page: number;
  label: string;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface AppStore {
  files: FileEntry[];
  hydrated: boolean;
  previewFocusByFileId: Record<string, PreviewFocus | undefined>;
  hydrateFromPersistence: () => Promise<void>;
  addFiles: (files: File[]) => Promise<void>;
  updateFile: (id: string, patch: Partial<FileEntry>) => void;
  updateAltTextDraft: (fileId: string, imageId: string, draft: ManualAltTextDraft | undefined) => void;
  updateStructureHeadingDraft: (fileId: string, key: string, include: boolean) => void;
  updateStructureTableDraft: (fileId: string, key: string, decision: ManualStructureTableDecision) => void;
  setPreviewFocus: (fileId: string, focus: PreviewFocus | undefined) => void;
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
  if ('remediationCompletedAt' in patch || 'validationCompletedAt' in patch) return true;
  if ('remediationIterations' in patch || 'remediationStopReason' in patch) return true;
  if ('manualReviewDrafts' in patch) return true;
  if ('error' in patch) return true;
  if (patch.status === 'remediated' || patch.status === 'error') return true;
  return false;
}

function normalizeManualReviewDrafts(drafts: ManualReviewDrafts | undefined): ManualReviewDrafts | undefined {
  if (!drafts) return undefined;
  const altTextEntries = Object.entries(drafts.altText ?? {}).filter(([, value]) => value);
  const includeHeadingEntries = Object.entries(drafts.structure?.includeHeadings ?? {}).filter(([, value]) => value === false);
  const tableDecisionEntries = Object.entries(drafts.structure?.tableDecisions ?? {}).filter(([, value]) => value && value !== 'review');

  if (altTextEntries.length === 0 && includeHeadingEntries.length === 0 && tableDecisionEntries.length === 0) {
    return undefined;
  }

  return {
    altText: Object.fromEntries(altTextEntries),
    structure: {
      includeHeadings: Object.fromEntries(includeHeadingEntries),
      tableDecisions: Object.fromEntries(tableDecisionEntries)
    },
    lastUpdatedAt: drafts.lastUpdatedAt
  };
}

export const useAppStore = create<AppStore>((set, get) => ({
  files: [],
  hydrated: false,
  previewFocusByFileId: {},
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
  },
  updateAltTextDraft: (fileId, imageId, draft) => {
    const file = get().files.find((entry) => entry.id === fileId);
    if (!file) return;

    const nextAltText = { ...(file.manualReviewDrafts?.altText ?? {}) };
    if (draft) {
      nextAltText[imageId] = draft;
    } else {
      delete nextAltText[imageId];
    }

    get().updateFile(fileId, {
      manualReviewDrafts: normalizeManualReviewDrafts({
        altText: nextAltText,
        structure: file.manualReviewDrafts?.structure ?? { includeHeadings: {}, tableDecisions: {} },
        lastUpdatedAt: new Date().toISOString()
      })
    });
  },
  updateStructureHeadingDraft: (fileId, key, include) => {
    const file = get().files.find((entry) => entry.id === fileId);
    if (!file) return;

    const nextIncludeHeadings = { ...(file.manualReviewDrafts?.structure?.includeHeadings ?? {}) };
    if (include) {
      delete nextIncludeHeadings[key];
    } else {
      nextIncludeHeadings[key] = false;
    }

    get().updateFile(fileId, {
      manualReviewDrafts: normalizeManualReviewDrafts({
        altText: file.manualReviewDrafts?.altText ?? {},
        structure: {
          includeHeadings: nextIncludeHeadings,
          tableDecisions: file.manualReviewDrafts?.structure?.tableDecisions ?? {}
        },
        lastUpdatedAt: new Date().toISOString()
      })
    });
  },
  updateStructureTableDraft: (fileId, key, decision) => {
    const file = get().files.find((entry) => entry.id === fileId);
    if (!file) return;

    const nextTableDecisions = { ...(file.manualReviewDrafts?.structure?.tableDecisions ?? {}) };
    if (decision === 'review') {
      delete nextTableDecisions[key];
    } else {
      nextTableDecisions[key] = decision;
    }

    get().updateFile(fileId, {
      manualReviewDrafts: normalizeManualReviewDrafts({
        altText: file.manualReviewDrafts?.altText ?? {},
        structure: {
          includeHeadings: file.manualReviewDrafts?.structure?.includeHeadings ?? {},
          tableDecisions: nextTableDecisions
        },
        lastUpdatedAt: new Date().toISOString()
      })
    });
  },
  setPreviewFocus: (fileId, focus) => {
    set((state) => ({
      previewFocusByFileId: {
        ...state.previewFocusByFileId,
        [fileId]: focus
      }
    }));
  }
}));
