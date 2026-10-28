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
import {
  clearAllStoredFiles,
  deleteFileEntries,
  loadAssetBytes,
  loadPersistedFile,
  loadPersistedFiles,
  saveFileEntry
} from '@/lib/persistence/file-store';
import { requestPersistentStorageOnce } from '@/lib/persistence/storage-quota';
import {
  broadcastFileChange,
  isQueueLeader,
  isQueueRunningInOtherTab,
  subscribeToFileChanges,
  type FileChangeMessage
} from '@/lib/client/tab-sync';
import { INTERRUPTED_MESSAGE } from '@/lib/client/error-copy';
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

export const MAX_FILES_PER_UPLOAD = 10;

export interface AddFilesResult {
  added: number;
  skipped: number;
  /** Names of the files beyond the per-upload limit, which were not added. */
  skippedNames: string[];
}

interface AppStore {
  files: FileEntry[];
  hydrated: boolean;
  /** Set when saved files could not be restored from browser storage. */
  hydrationError?: string;
  /** Saved files deleted at the last restore because they passed the retention period. */
  expiredFileCount: number;
  /** Another tab of the app is running the processing queue, so files here wait. */
  processingInOtherTab: boolean;
  previewFocusByFileId: Record<string, PreviewFocus | undefined>;
  hydrateFromPersistence: () => Promise<void>;
  addFiles: (files: File[], options?: AddFilesOptions) => Promise<AddFilesResult>;
  updateFile: (id: string, patch: Partial<FileEntry>) => void;
  /**
   * Mark a file as started and wait until that is saved, so a tab that
   * crashes during the heavy work is detected on reload.
   */
  beginProcessing: (id: string) => Promise<void>;
  /** Put a failed file back in the queue. */
  retryFile: (id: string) => void;
  /** Turn files left mid-processing by a tab that is gone into a retryable error. */
  markInterrupted: (ids: string[]) => void;
  removeFile: (id: string) => void;
  /** Delete every file from this browser's storage and the list. */
  clearAllFiles: () => Promise<void>;
  setProcessingInOtherTab: (value: boolean) => void;
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

/** Statuses that only exist while a tab is working on the file. */
export const MID_PROCESSING_STATUSES = new Set<FileEntry['status']>([
  'parsing',
  'ocr',
  'auditing',
  'audited',
  'remediating'
]);

function interruptedPatch(file: FileEntry): Partial<FileEntry> {
  return {
    status: 'error',
    progress: 100,
    error: INTERRUPTED_MESSAGE,
    errorCode: 'interrupted',
    errorDetail: `Stopped while "${file.status}" (attempt ${file.processingAttempts ?? 1}, started ${file.processingStartedAt ?? 'at an unknown time'}).`
  };
}

function normalizePersistedFile(file: FileEntry): FileEntry {
  return {
    ...file,
    manualReviewDrafts: normalizeManualReviewDrafts(file.manualReviewDrafts)
  } satisfies FileEntry;
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
  if ('ocrAttempted' in patch || 'ocrApplied' in patch || 'ocrReason' in patch || 'ocrCoverage' in patch) return true;
  if ('remediationMode' in patch || 'verapdfResult' in patch) return true;
  if ('remediationCompletedAt' in patch || 'validationCompletedAt' in patch) return true;
  if ('remediationIterations' in patch || 'remediationStopReason' in patch) return true;
  if ('processingAttempts' in patch || 'processingStartedAt' in patch || 'pageCount' in patch) return true;
  if ('manualReviewDrafts' in patch) return true;
  if ('workflowProgress' in patch) return true;
  if ('error' in patch || 'errorCode' in patch || 'errorDetail' in patch) return true;
  if (patch.status === 'remediated' || patch.status === 'error' || patch.status === 'queued') return true;
  return false;
}

function assetsForPatch(patch: Partial<FileEntry>) {
  const assets: { uploaded?: ArrayBuffer; remediated?: ArrayBuffer | null } = {};
  if (patch.uploadedBytes) assets.uploaded = patch.uploadedBytes;
  if ('remediatedBytes' in patch) assets.remediated = patch.remediatedBytes ?? null;
  return assets;
}

function describePersistError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'This browser is out of storage space, so this file was not fully saved and will not survive a page reload. Keep this tab open, download the result when it is ready, and remove older files from the list.';
  }
  return 'This file could not be saved in this browser, so it will not survive a page reload. Keep this tab open and download the result when it is ready.';
}

function isFullyStored(file: FileEntry): boolean {
  return file.uploadedBytesStored !== false && file.remediatedBytesStored !== false;
}

let hydrationInFlight: Promise<void> | undefined;
let unsubscribeFromOtherTabs: (() => void) | undefined;

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

/** Change a file in memory only (no save, no broadcast). */
function patchInMemory(id: string, patch: Partial<FileEntry> | ((file: FileEntry) => FileEntry)) {
  useAppStore.setState((state) => ({
    files: state.files.map((file) => {
      if (file.id !== id) return file;
      return typeof patch === 'function' ? patch(file) : { ...file, ...patch };
    })
  }));
}

/**
 * Save a file's current state. PDFs an earlier save could not store (for
 * example because storage was full) are retried with every save, and the
 * storage warning stays until both are stored.
 */
function persistEntry(id: string, patch: Partial<FileEntry>): Promise<void> {
  const entry = useAppStore.getState().files.find((file) => file.id === id);
  if (!entry) return Promise.resolve();

  const assets = assetsForPatch(patch);
  if (!assets.uploaded && entry.uploadedBytesStored === false && entry.uploadedBytes) {
    assets.uploaded = entry.uploadedBytes;
  }
  if (!('remediated' in assets) && entry.remediatedBytesStored === false && entry.remediatedBytes) {
    assets.remediated = entry.remediatedBytes;
  }

  return saveFileEntry(entry, { assets })
    .then(() => {
      patchInMemory(id, (file) => {
        const next: FileEntry = { ...file };
        if (assets.uploaded) next.uploadedBytesStored = true;
        if (assets.remediated) next.remediatedBytesStored = true;
        if (assets.remediated === null) next.remediatedBytesStored = undefined;
        if (next.persistError && isFullyStored(next)) next.persistError = undefined;
        return next;
      });
      broadcastFileChange({ type: 'saved', id });
    })
    .catch((err) => {
      console.error(`[app-store] Failed to persist file ${id}:`, err);
      patchInMemory(id, {
        persistError: describePersistError(err),
        ...(assets.uploaded ? { uploadedBytesStored: false } : {}),
        ...(assets.remediated ? { remediatedBytesStored: false } : {})
      });
    });
}

/** Refresh this tab after another tab saved, removed or cleared files. */
function applyChangeFromOtherTab(message: FileChangeMessage) {
  if (message.type === 'cleared') {
    useAppStore.setState({ files: [], previewFocusByFileId: {} });
    return;
  }
  if (message.type === 'removed') {
    const ids = new Set(message.ids);
    useAppStore.setState((state) => ({ files: state.files.filter((file) => !ids.has(file.id)) }));
    return;
  }

  const local = useAppStore.getState().files.find((file) => file.id === message.id);
  // The tab running the queue owns the files it is processing.
  if (local && isQueueLeader() && MID_PROCESSING_STATUSES.has(local.status)) return;
  void (async () => {
    const stored = await loadPersistedFile(message.id, { loadBytes: false });
    if (!stored) return;
    const current = useAppStore.getState().files.find((file) => file.id === message.id);
    // Only read the remediated PDF again when the result itself changed.
    const resultChanged = current?.remediationCompletedAt !== stored.remediationCompletedAt;
    const remediatedBytes =
      stored.remediatedBytesStored && (resultChanged || !current?.remediatedBytes)
        ? await loadAssetBytes(message.id, 'remediated')
        : resultChanged
          ? undefined
          : current?.remediatedBytes;
    const merged = normalizePersistedFile({
      ...stored,
      uploadedBytes: current?.uploadedBytes,
      remediatedBytes,
      persistError: current?.persistError
    });
    useAppStore.setState((state) => ({
      files: state.files.some((file) => file.id === message.id)
        ? state.files.map((file) => (file.id === message.id ? merged : file))
        : [...state.files, merged]
    }));
  })().catch((err) => {
    console.error('[app-store] Failed to refresh a file changed in another tab:', err);
  });
}

export const useAppStore = create<AppStore>((set, get) => ({
  files: [],
  hydrated: false,
  expiredFileCount: 0,
  processingInOtherTab: false,
  previewFocusByFileId: {},
  hydrateFromPersistence: () => {
    if (get().hydrated || typeof window === 'undefined') return Promise.resolve();
    // React strict mode runs effects twice; share one restore.
    hydrationInFlight ??= (async () => {
      try {
        // Files mid-processing belong to another tab if one is running the queue.
        const otherTabIsProcessing = await isQueueRunningInOtherTab();
        const { files: persistedFiles, droppedIds, expiredIds } = await loadPersistedFiles();
        const interruptedIds: string[] = [];
        set((state) => {
          const seenIds = new Set(state.files.map((file) => file.id));
          const hydratedFiles = persistedFiles
            .filter((file) => !seenIds.has(file.id))
            .map((file) => {
              const normalized = normalizePersistedFile(file);
              if (otherTabIsProcessing || !MID_PROCESSING_STATUSES.has(normalized.status)) return normalized;
              // Never restart these automatically: if the file crashed the
              // tab, it would crash it again on every visit.
              interruptedIds.push(normalized.id);
              return { ...normalized, ...interruptedPatch(normalized) };
            });

          return {
            files: [...hydratedFiles, ...state.files],
            hydrated: true,
            expiredFileCount: expiredIds.length
          };
        });
        for (const id of interruptedIds) void persistEntry(id, { status: 'error' });
        const deleteIds = [...droppedIds, ...expiredIds];
        if (deleteIds.length > 0) {
          void deleteFileEntries(deleteIds).catch((err) => {
            console.error('[app-store] Failed to delete incomplete or expired saved files:', err);
          });
        }
      } catch (err) {
        console.error('[app-store] Failed to restore saved files:', err);
        set({
          hydrated: true,
          hydrationError: 'Saved files could not be loaded from this browser. New uploads still work, but earlier results are not available.'
        });
      } finally {
        hydrationInFlight = undefined;
        unsubscribeFromOtherTabs ??= subscribeToFileChanges((message) => {
          if (get().hydrated) applyChangeFromOtherTab(message);
        });
      }
    })();
    return hydrationInFlight;
  },
  addFiles: async (files, options) => {
    const createdAt = new Date().toISOString();
    const entries: FileEntry[] = await Promise.all(
      files.slice(0, MAX_FILES_PER_UPLOAD).map(async (file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        createdAt,
        uploadedBytes: await file.arrayBuffer(),
        uploadedBytesStored: false,
        uploadIntent: options?.uploadIntent ?? 'new-upload',
        derivedFromFileId: options?.uploadIntent === 'revalidation' ? options.derivedFromFileId : undefined,
        status: 'queued' as const,
        progress: 0
      }))
    );

    set((state) => ({ files: [...state.files, ...entries] }));
    requestPersistentStorageOnce();
    for (const entry of entries) {
      void persistEntry(entry.id, { uploadedBytes: entry.uploadedBytes });
    }
    const skippedNames = files.slice(MAX_FILES_PER_UPLOAD).map((file) => file.name);
    return { added: entries.length, skipped: skippedNames.length, skippedNames };
  },
  updateFile: (id, patch) => {
    if (!get().files.some((file) => file.id === id)) return;
    patchInMemory(id, patch);
    if (shouldPersistPatch(patch)) void persistEntry(id, patch);
  },
  beginProcessing: async (id) => {
    const file = get().files.find((entry) => entry.id === id);
    if (!file) return;
    const patch: Partial<FileEntry> = {
      status: 'parsing',
      progress: 10,
      processingStartedAt: new Date().toISOString(),
      processingAttempts: (file.processingAttempts ?? 0) + 1,
      error: undefined,
      errorCode: undefined,
      errorDetail: undefined
    };
    patchInMemory(id, patch);
    await persistEntry(id, patch);
  },
  retryFile: (id) => {
    const file = get().files.find((entry) => entry.id === id);
    if (!file || file.status !== 'error') return;
    get().updateFile(id, {
      status: 'queued',
      progress: 0,
      error: undefined,
      errorCode: undefined,
      errorDetail: undefined,
      processingStartedAt: undefined
    });
  },
  markInterrupted: (ids) => {
    for (const id of ids) {
      const file = get().files.find((entry) => entry.id === id);
      if (file && MID_PROCESSING_STATUSES.has(file.status)) get().updateFile(id, interruptedPatch(file));
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

    void deleteFileEntries(fileIdsToRemove)
      .then(() => broadcastFileChange({ type: 'removed', ids: fileIdsToRemove }))
      .catch((err) => {
        console.error('[app-store] Failed to delete persisted file entries:', err);
      });
  },
  clearAllFiles: async () => {
    set({ files: [], previewFocusByFileId: {}, expiredFileCount: 0 });
    await clearAllStoredFiles();
    broadcastFileChange({ type: 'cleared' });
  },
  setProcessingInOtherTab: (value) => {
    if (get().processingInOtherTab !== value) set({ processingInOtherTab: value });
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
        // Keep the only copy if storage never got one.
        if (file.id !== fileId || !file.uploadedBytesStored) return file;
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
