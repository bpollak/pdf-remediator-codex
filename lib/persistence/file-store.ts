import type { FileEntry } from '@/types/file-entry';

const DB_NAME = 'accessible-pdf';
const DB_VERSION = 1;
const FILE_STORE = 'files';
const ASSET_STORE = 'assets';

interface PersistedFileRecord extends Omit<FileEntry, 'uploadedBytes' | 'remediatedBytes' | 'processingStartedAt' | 'persistError'> {
  uploadedAssetKey: string;
  remediatedAssetKey?: string;
}

interface PersistedAssetRecord {
  key: string;
  bytes: ArrayBuffer;
}

interface SaveFileEntryOptions {
  /**
   * PDF bytes to write alongside the record. Only the variants named here are
   * written; `remediated: null` deletes the stored remediated PDF. Omitted
   * variants are left as they are in storage.
   */
  assets?: {
    uploaded?: ArrayBuffer;
    remediated?: ArrayBuffer | null;
  };
}

interface LoadPersistedFilesResult {
  files: FileEntry[];
  /** Records whose uploaded PDF is missing from storage; they were deleted. */
  droppedIds: string[];
}

function stripAssetKeys(record: PersistedFileRecord): Omit<PersistedFileRecord, 'uploadedAssetKey' | 'remediatedAssetKey'> {
  const next = { ...record };
  delete (next as { uploadedAssetKey?: string }).uploadedAssetKey;
  delete (next as { remediatedAssetKey?: string }).remediatedAssetKey;
  return next;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FILE_STORE)) {
        database.createObjectStore(FILE_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(ASSET_STORE)) {
        database.createObjectStore(ASSET_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

function uploadedAssetKey(fileId: string): string {
  return `${fileId}:uploaded`;
}

function remediatedAssetKey(fileId: string): string {
  return `${fileId}:remediated`;
}

/**
 * Load saved files. The original upload is only read into memory for files
 * that have no remediated PDF yet; for finished files it stays in storage and
 * is loaded on demand with loadAssetBytes().
 */
export async function loadPersistedFiles(): Promise<LoadPersistedFilesResult> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction([FILE_STORE, ASSET_STORE], 'readonly');
    const fileStore = transaction.objectStore(FILE_STORE);
    const assetStore = transaction.objectStore(ASSET_STORE);
    const rawRecords = await requestToPromise(fileStore.getAll());
    const fileRecords = (Array.isArray(rawRecords) ? rawRecords : []).filter(
      (record): record is PersistedFileRecord =>
        record != null &&
        typeof record === 'object' &&
        typeof (record as { id?: unknown }).id === 'string' &&
        typeof (record as { uploadedAssetKey?: unknown }).uploadedAssetKey === 'string'
    );

    const hydratedFiles = await Promise.all(
      fileRecords.map(async (record) => {
        const remediatedAsset = record.remediatedAssetKey
          ? (await requestToPromise(assetStore.get(record.remediatedAssetKey)) as PersistedAssetRecord | undefined)
          : undefined;
        const fileRecord = stripAssetKeys(record);

        if (remediatedAsset?.bytes) {
          const uploadedExists = (await requestToPromise(assetStore.count(record.uploadedAssetKey))) > 0;
          if (!uploadedExists) return { droppedId: record.id };
          return { file: { ...fileRecord, remediatedBytes: remediatedAsset.bytes } satisfies FileEntry };
        }

        const uploadedAsset = await requestToPromise(assetStore.get(record.uploadedAssetKey)) as PersistedAssetRecord | undefined;
        if (!uploadedAsset?.bytes) return { droppedId: record.id };
        return { file: { ...fileRecord, uploadedBytes: uploadedAsset.bytes } satisfies FileEntry };
      })
    );

    const files: FileEntry[] = [];
    const droppedIds: string[] = [];
    for (const result of hydratedFiles) {
      if (result.file) files.push(result.file);
      if (result.droppedId) droppedIds.push(result.droppedId);
    }

    return { files, droppedIds };
  } finally {
    database.close();
  }
}

export async function saveFileEntry(entry: FileEntry, options: SaveFileEntryOptions = {}): Promise<void> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction([FILE_STORE, ASSET_STORE], 'readwrite');
    const fileStore = transaction.objectStore(FILE_STORE);
    const assetStore = transaction.objectStore(ASSET_STORE);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { uploadedBytes, remediatedBytes, processingStartedAt, persistError, ...record } = entry;
    const assets = options.assets ?? {};
    // In-memory bytes may have been released, so the stored remediated PDF is
    // still the record's asset unless this save deletes it.
    const hasRemediatedAsset = assets.remediated === null ? false : Boolean(assets.remediated ?? remediatedBytes ?? entry.remediationCompletedAt);

    fileStore.put({
      ...record,
      uploadedAssetKey: uploadedAssetKey(entry.id),
      remediatedAssetKey: hasRemediatedAsset ? remediatedAssetKey(entry.id) : undefined
    } satisfies PersistedFileRecord);

    if (assets.uploaded) {
      assetStore.put({ key: uploadedAssetKey(entry.id), bytes: assets.uploaded } satisfies PersistedAssetRecord);
    }
    if (assets.remediated) {
      assetStore.put({ key: remediatedAssetKey(entry.id), bytes: assets.remediated } satisfies PersistedAssetRecord);
    } else if (assets.remediated === null) {
      assetStore.delete(remediatedAssetKey(entry.id));
    }

    await transactionToPromise(transaction);
  } finally {
    database.close();
  }
}

/**
 * Load a single asset (uploaded or remediated bytes) from IndexedDB on demand.
 * Use this to lazy-load large buffers instead of keeping them in memory.
 */
export async function loadAssetBytes(fileId: string, variant: 'uploaded' | 'remediated'): Promise<ArrayBuffer | undefined> {
  const key = variant === 'uploaded' ? uploadedAssetKey(fileId) : remediatedAssetKey(fileId);
  const database = await openDatabase();

  try {
    const transaction = database.transaction([ASSET_STORE], 'readonly');
    const assetStore = transaction.objectStore(ASSET_STORE);
    const asset = await requestToPromise(assetStore.get(key)) as PersistedAssetRecord | undefined;
    return asset?.bytes;
  } finally {
    database.close();
  }
}

export async function deleteFileEntries(fileIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(fileIds)];
  if (uniqueIds.length === 0) return;

  const database = await openDatabase();

  try {
    const transaction = database.transaction([FILE_STORE, ASSET_STORE], 'readwrite');
    const fileStore = transaction.objectStore(FILE_STORE);
    const assetStore = transaction.objectStore(ASSET_STORE);

    for (const fileId of uniqueIds) {
      fileStore.delete(fileId);
      assetStore.delete(uploadedAssetKey(fileId));
      assetStore.delete(remediatedAssetKey(fileId));
    }

    await transactionToPromise(transaction);
  } finally {
    database.close();
  }
}
