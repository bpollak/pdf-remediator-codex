'use client';

import { create } from 'zustand';
import { detectHeadings } from '@/lib/remediate/heuristics';
import {
  getHeadingDraftKey,
  getManualReviewDrafts,
  getOrderedStructureHeadingKeys,
  getParsedReviewBase,
  normalizeManualReviewDrafts
} from '@/lib/report/manual-review';
import { deleteFileEntries, loadAssetBytes, loadPersistedFiles, saveFileEntry } from '@/lib/persistence/file-store';
import type {
  FileEntry,
  ManualAltTextDraft,
  ManualCustomElementCategory,
  ManualCustomElementDraft,
  ManualReviewDrafts,
  ManualStructureHeadingDraft,
  ManualStructureTableDecision,
  WorkflowProgress,
  UploadIntent
} from '@/types/file-entry';

export type { FileEntry } from '@/types/file-entry';
export type { ManualStructureTableDecision } from '@/types/file-entry';

export interface PreviewFocus {
  variant?: 'original' | 'remediated';
  page: number;
  label: string;
  detail?: string;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface AddFilesOptions {
  uploadIntent?: UploadIntent;
  derivedFromFileId?: string;
}

interface AppStore {
  files: FileEntry[];
  hydrated: boolean;
  previewFocusByFileId: Record<string, PreviewFocus | undefined>;
  hydrateFromPersistence: () => Promise<void>;
  addFiles: (files: File[], options?: AddFilesOptions) => Promise<void>;
  updateFile: (id: string, patch: Partial<FileEntry>) => void;
  removeFile: (id: string) => void;
  updateAltTextDraft: (fileId: string, imageId: string, draft: ManualAltTextDraft | undefined) => void;
  updateStructureHeadingIncluded: (fileId: string, key: string, include: boolean) => void;
  updateStructureHeadingLevel: (fileId: string, key: string, level: number | undefined) => void;
  moveStructureHeading: (fileId: string, key: string, direction: 'up' | 'down') => void;
  resetStructureHeadingOrder: (fileId: string) => void;
  updateStructureTableDraft: (fileId: string, key: string, decision: ManualStructureTableDecision) => void;
  addManualCustomElement: (
    fileId: string,
    input: { title: string; category: ManualCustomElementCategory; note?: string }
  ) => void;
  updateManualCustomElement: (
    fileId: string,
    itemId: string,
    patch: Partial<Pick<ManualCustomElementDraft, 'title' | 'category' | 'note' | 'status'>>
  ) => void;
  removeManualCustomElement: (fileId: string, itemId: string) => void;
  releaseUploadedBytes: (fileId: string) => void;
  ensureUploadedBytes: (fileId: string) => Promise<ArrayBuffer | undefined>;
  markWorkflowProgress: (fileId: string, patch: Partial<WorkflowProgress>) => void;
  setPreviewFocus: (fileId: string, focus: PreviewFocus | undefined) => void;
}

const NON_PERSISTED_STATUSES = new Set<FileEntry['status']>([
  'queued',
  'parsing',
  'ocr',
  'auditing',
  'audited',
  'remediating'
]);

function normalizePersistedFile(file: FileEntry): FileEntry {
  const normalized = {
    ...file,
    manualReviewDrafts: normalizeManualReviewDrafts(file.manualReviewDrafts)
  } satisfies FileEntry;

  if (!NON_PERSISTED_STATUSES.has(file.status)) return normalized;
  return {
    ...normalized,
    status: 'queued',
    progress: 0,
    error: undefined
  };
}

function shouldPersistPatch(patch: Partial<FileEntry>): boolean {
  if ('uploadedBytes' in patch || 'remediatedBytes' in patch) return true;
  if ('parsedData' in patch || 'remediatedParsedData' in patch) return true;
  if ('auditResult' in patch || 'postRemediationAudit' in patch) return true;
  if (
    'sourceType' in patch ||
    'sourceTypeConfidence' in patch ||
    'sourceTypeReasons' in patch ||
    'sourceTypeSuggestedAction' in patch
  ) {
    return true;
  }
  if ('ocrAttempted' in patch || 'ocrApplied' in patch || 'ocrReason' in patch) return true;
  if ('remediationMode' in patch || 'verapdfResult' in patch) return true;
  if ('remediationCompletedAt' in patch || 'validationCompletedAt' in patch) return true;
  if ('remediationIterations' in patch || 'remediationStopReason' in patch) return true;
  if ('manualReviewDrafts' in patch) return true;
  if ('workflowProgress' in patch) return true;
  if ('error' in patch) return true;
  if (patch.status === 'remediated' || patch.status === 'error') return true;
  return false;
}

function shouldPersistAssetsForPatch(patch: Partial<FileEntry>): boolean {
  return 'uploadedBytes' in patch || 'remediatedBytes' in patch;
}

function buildManualReviewDrafts(
  file: FileEntry,
  options: {
    altText?: Record<string, ManualAltTextDraft>;
    structure?: ManualReviewDrafts['structure'];
    customElements?: ManualCustomElementDraft[];
  }
): ManualReviewDrafts | undefined {
  const drafts = getManualReviewDrafts(file);
  return normalizeManualReviewDrafts({
    altText: options.altText ?? drafts.altText,
    structure: options.structure ?? drafts.structure,
    customElements: options.customElements ?? drafts.customElements,
    lastUpdatedAt: new Date().toISOString()
  });
}

function mergeWorkflowProgress(
  file: FileEntry,
  patch: Partial<WorkflowProgress>
): WorkflowProgress {
  return {
    ...(file.workflowProgress ?? {}),
    ...patch
  };
}

function nextHeadingDraft(
  current: ManualStructureHeadingDraft | undefined,
  patch: Partial<ManualStructureHeadingDraft>
): ManualStructureHeadingDraft | undefined {
  const nextDraft = {
    ...current,
    ...patch
  };

  if (nextDraft.include !== false) delete nextDraft.include;
  if (typeof nextDraft.level !== 'number') delete nextDraft.level;

  return Object.keys(nextDraft).length > 0 ? nextDraft : undefined;
}

function getDetectedHeadingKeys(file: FileEntry): string[] {
  const parsed = getParsedReviewBase(file);
  if (!parsed) return [];
  return detectHeadings(parsed).map((heading, index) => getHeadingDraftKey(heading, index));
}

export function collectDescendantFileIds(files: FileEntry[], rootId: string): string[] {
  const descendants: string[] = [];
  const pending = [rootId];
  const seen = new Set<string>([rootId]);

  while (pending.length > 0) {
    const currentId = pending.pop();
    if (!currentId) continue;

    for (const candidate of files) {
      if (candidate.derivedFromFileId !== currentId || seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      descendants.push(candidate.id);
      pending.push(candidate.id);
    }
  }

  return descendants;
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
  addFiles: async (files, options) => {
    const entries = await Promise.all(
      files.slice(0, 10).map(async (file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        uploadedBytes: await file.arrayBuffer(),
        uploadIntent: options?.uploadIntent ?? 'new-upload',
        derivedFromFileId: options?.uploadIntent === 'revalidation' ? options.derivedFromFileId : undefined,
        status: 'queued' as const,
        progress: 0
      }))
    );

    set((state) => ({ files: [...state.files, ...entries], hydrated: true }));
    void Promise.all(entries.map((entry) => saveFileEntry(entry))).catch((err) => {
      console.error('[app-store] Failed to persist new file entries:', err);
    });
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
      void saveFileEntry(updatedEntry, { persistAssets: shouldPersistAssetsForPatch(patch) }).catch((err) => {
        console.error(`[app-store] Failed to persist update for file ${id}:`, err);
      });
    }
  },
  removeFile: (id) => {
    const files = get().files;
    if (!files.some((file) => file.id === id)) return;

    const fileIdsToRemove = [id, ...collectDescendantFileIds(files, id)];
    const idsToRemove = new Set(fileIdsToRemove);

    set((state) => {
      const nextPreviewFocusByFileId = { ...state.previewFocusByFileId };
      for (const fileId of fileIdsToRemove) {
        delete nextPreviewFocusByFileId[fileId];
      }

      return {
        files: state.files.filter((file) => !idsToRemove.has(file.id)),
        previewFocusByFileId: nextPreviewFocusByFileId
      };
    });

    void deleteFileEntries(fileIdsToRemove).catch((err) => {
      console.error('[app-store] Failed to delete persisted file entries:', err);
    });
  },
  updateAltTextDraft: (fileId, imageId, draft) => {
    const file = get().files.find((entry) => entry.id === fileId);
    if (!file) return;

    const nextAltText = { ...getManualReviewDrafts(file).altText };
    if (draft) {
      nextAltText[imageId] = draft;
    } else {
      delete nextAltText[imageId];
    }

    get().updateFile(fileId, {
      manualReviewDrafts: buildManualReviewDrafts(file, { altText: nextAltText }),
      workflowProgress: mergeWorkflowProgress(file, {
        altTextPreparedAt: file.workflowProgress?.altTextPreparedAt ?? new Date().toISOString()
      })
    });
  },
  updateStructureHeadingIncluded: (fileId, key, include) => {
    const file = get().files.find((entry) => entry.id === fileId);
    if (!file) return;

    const drafts = getManualReviewDrafts(file);
    const nextHeadings = { ...drafts.structure.headings };
    const nextDraft = nextHeadingDraft(nextHeadings[key], { include: include ? undefined : false });

    if (nextDraft) nextHeadings[key] = nextDraft;
    else delete nextHeadings[key];

    get().updateFile(fileId, {
      manualReviewDrafts: buildManualReviewDrafts(file, {
        structure: {
          ...drafts.structure,
          headings: nextHeadings
        }
      }),
      workflowProgress: mergeWorkflowProgress(file, {
        structurePreparedAt: file.workflowProgress?.structurePreparedAt ?? new Date().toISOString()
      })
    });
  },
  updateStructureHeadingLevel: (fileId, key, level) => {
    const file = get().files.find((entry) => entry.id === fileId);
    if (!file) return;

    const drafts = getManualReviewDrafts(file);
    const nextHeadings = { ...drafts.structure.headings };
    const nextDraft = nextHeadingDraft(nextHeadings[key], { level });

    if (nextDraft) nextHeadings[key] = nextDraft;
    else delete nextHeadings[key];

    get().updateFile(fileId, {
      manualReviewDrafts: buildManualReviewDrafts(file, {
        structure: {
          ...drafts.structure,
          headings: nextHeadings
        }
      }),
      workflowProgress: mergeWorkflowProgress(file, {
        structurePreparedAt: file.workflowProgress?.structurePreparedAt ?? new Date().toISOString()
      })
    });
  },
  moveStructureHeading: (fileId, key, direction) => {
    const file = get().files.find((entry) => entry.id === fileId);
    if (!file) return;

    const drafts = getManualReviewDrafts(file);
    const detectedKeys = getDetectedHeadingKeys(file);
    const currentOrder = getOrderedStructureHeadingKeys(file, detectedKeys);
    const currentIndex = currentOrder.indexOf(key);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= currentOrder.length) return;

    const nextOrder = [...currentOrder];
    const [movedKey] = nextOrder.splice(currentIndex, 1);
    if (!movedKey) return;
    nextOrder.splice(targetIndex, 0, movedKey);

    get().updateFile(fileId, {
      manualReviewDrafts: buildManualReviewDrafts(file, {
        structure: {
          ...drafts.structure,
          headingOrder: nextOrder
        }
      }),
      workflowProgress: mergeWorkflowProgress(file, {
        structurePreparedAt: file.workflowProgress?.structurePreparedAt ?? new Date().toISOString()
      })
    });
  },
  resetStructureHeadingOrder: (fileId) => {
    const file = get().files.find((entry) => entry.id === fileId);
    if (!file) return;

    const drafts = getManualReviewDrafts(file);
    get().updateFile(fileId, {
      manualReviewDrafts: buildManualReviewDrafts(file, {
        structure: {
          ...drafts.structure,
          headingOrder: []
        }
      }),
      workflowProgress: mergeWorkflowProgress(file, {
        structurePreparedAt: file.workflowProgress?.structurePreparedAt ?? new Date().toISOString()
      })
    });
  },
  updateStructureTableDraft: (fileId, key, decision) => {
    const file = get().files.find((entry) => entry.id === fileId);
    if (!file) return;

    const drafts = getManualReviewDrafts(file);
    const nextTableDecisions = { ...drafts.structure.tableDecisions };
    if (decision === 'review') {
      delete nextTableDecisions[key];
    } else {
      nextTableDecisions[key] = decision;
    }

    get().updateFile(fileId, {
      manualReviewDrafts: buildManualReviewDrafts(file, {
        structure: {
          ...drafts.structure,
          tableDecisions: nextTableDecisions
        }
      }),
      workflowProgress: mergeWorkflowProgress(file, {
        structurePreparedAt: file.workflowProgress?.structurePreparedAt ?? new Date().toISOString()
      })
    });
  },
  addManualCustomElement: (fileId, input) => {
    const file = get().files.find((entry) => entry.id === fileId);
    const title = input.title.trim();
    if (!file || !title) return;

    const drafts = getManualReviewDrafts(file);
    const now = new Date().toISOString();
    const note = input.note?.trim();

    get().updateFile(fileId, {
      manualReviewDrafts: buildManualReviewDrafts(file, {
        customElements: [
          ...drafts.customElements,
          {
            id: crypto.randomUUID(),
            title,
            category: input.category,
            status: 'todo',
            createdAt: now,
            updatedAt: now,
            ...(note ? { note } : {})
          }
        ]
      })
    });
  },
  updateManualCustomElement: (fileId, itemId, patch) => {
    const file = get().files.find((entry) => entry.id === fileId);
    if (!file) return;

    const drafts = getManualReviewDrafts(file);
    const now = new Date().toISOString();
    const nextCustomElements = drafts.customElements.map((item) => {
      if (item.id !== itemId) return item;

      const nextStatus = patch.status ?? item.status;
      const completedAt =
        nextStatus === 'done'
          ? item.completedAt ?? now
          : undefined;
      const note = patch.note !== undefined ? patch.note.trim() : item.note;

      return {
        ...item,
        ...patch,
        title: patch.title !== undefined ? patch.title.trim() : item.title,
        note,
        status: nextStatus,
        updatedAt: now,
        completedAt
      };
    });

    get().updateFile(fileId, {
      manualReviewDrafts: buildManualReviewDrafts(file, {
        customElements: nextCustomElements
      })
    });
  },
  removeManualCustomElement: (fileId, itemId) => {
    const file = get().files.find((entry) => entry.id === fileId);
    if (!file) return;

    const drafts = getManualReviewDrafts(file);
    get().updateFile(fileId, {
      manualReviewDrafts: buildManualReviewDrafts(file, {
        customElements: drafts.customElements.filter((item) => item.id !== itemId)
      })
    });
  },
  releaseUploadedBytes: (fileId) => {
    set((state) => ({
      files: state.files.map((file) => {
        if (file.id !== fileId) return file;
        // Replace in-memory buffer with undefined; bytes remain in IndexedDB.
        return { ...file, uploadedBytes: undefined };
      })
    }));
  },
  ensureUploadedBytes: async (fileId) => {
    const file = get().files.find((entry) => entry.id === fileId);
    if (file?.uploadedBytes) return file.uploadedBytes;
    // Lazy-reload from IndexedDB.
    const bytes = await loadAssetBytes(fileId, 'uploaded');
    if (bytes) {
      set((state) => ({
        files: state.files.map((f) => (f.id === fileId ? { ...f, uploadedBytes: bytes } : f))
      }));
    }
    return bytes;
  },
  markWorkflowProgress: (fileId, patch) => {
    const file = get().files.find((entry) => entry.id === fileId);
    if (!file) return;

    get().updateFile(fileId, {
      workflowProgress: mergeWorkflowProgress(file, patch)
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
