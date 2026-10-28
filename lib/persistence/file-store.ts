import type { FileEntry } from '@/types/file-entry';

const DB_NAME = 'accessible-pdf';
const DB_VERSION = 1;
const FILE_STORE = 'files';
const ASSET_STORE = 'assets';

/** Saved files not touched for this long are deleted the next time the app loads. */
export const STORED_FILE_RETENTION_DAYS = 30;
const STORED_FILE_RETENTION_MS = STORED_FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** Fields that only make sense in memory, or are derived from storage on load. */
type InMemoryOnlyField = 'uploadedBytes' | 'remediatedBytes' | 'persistError' | 'uploadedBytesStored' | 'remediatedBytesStored';

interface PersistedFileRecord extends Omit<FileEntry, InMemoryOnlyField> {
  uploadedAssetKey: string;
  remediatedAssetKey?: string;
  /** Last time this record was written; drives retention. */
  savedAt?: string;
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
  /** Records with neither PDF in storage; the caller should delete them. */
  droppedIds: string[];
  /** Records older than the retention period; the caller should delete them. */
  expiredIds: string[];
}

function stripAssetKeys(record: PersistedFileRecord): Omit<PersistedFileRecord, 'uploadedAssetKey' | 'remediatedAssetKey' | 'savedAt'> {
  const next = { ...record };
  delete (next as { uploadedAssetKey?: string }).uploadedAssetKey;
  delete (next as { remediatedAssetKey?: string }).remediatedAssetKey;
  delete (next as { savedAt?: string }).savedAt;
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

    // Another tab still has an older version open. The open continues once it
    // closes; each connection here is short-lived, so this is rare.
    request.onblocked = () => {
      console.warn('[file-store] Waiting for another tab to release browser storage.');
    };

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FILE_STORE)) {
        database.createObjectStore(FILE_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(ASSET_STORE)) {
        database.createObjectStore(ASSET_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      // Let a newer version of the app (in another tab) upgrade the schema.
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

function uploadedAssetKey(fileId: string): string {
  return `${fileId}:uploaded`;
}

function remediatedAssetKey(fileId: string): string {
  return `${fileId}:remediated`;
}

function isPersistedFileRecord(record: unknown): record is PersistedFileRecord {
  return (
    record != null &&
    typeof record === 'object' &&
    typeof (record as { id?: unknown }).id === 'string' &&
    typeof (record as { uploadedAssetKey?: unknown }).uploadedAssetKey === 'string'
  );
}

function isExpired(record: PersistedFileRecord, now: number): boolean {
  const savedAt = record.savedAt ? Date.parse(record.savedAt) : NaN;
  return Number.isFinite(savedAt) && now - savedAt > STORED_FILE_RETENTION_MS;
}

type HydratedRecord = { file: FileEntry; droppedId?: undefined } | { droppedId: string; file?: undefined };

async function hydrateRecord(
  record: PersistedFileRecord,
  assetStore: IDBObjectStore,
  options: { loadBytes: boolean } = { loadBytes: true }
): Promise<HydratedRecord> {
  const fileRecord = stripAssetKeys(record);
  const assetExists = async (key: string | undefined) =>
    key ? (await requestToPromise(assetStore.count(key))) > 0 : false;

  if (!options.loadBytes) {
    const [uploadedStored, remediatedStored] = await Promise.all([
      assetExists(record.uploadedAssetKey),
      assetExists(record.remediatedAssetKey)
    ]);
    if (!uploadedStored && !remediatedStored) return { droppedId: record.id };
    return {
      file: {
        ...fileRecord,
        uploadedBytesStored: uploadedStored,
        remediatedBytesStored: record.remediatedAssetKey ? remediatedStored : undefined
      } satisfies FileEntry
    };
  }

  const remediatedAsset = record.remediatedAssetKey
    ? (await requestToPromise(assetStore.get(record.remediatedAssetKey)) as PersistedAssetRecord | undefined)
    : undefined;

  if (remediatedAsset?.bytes) {
    // The original is only needed for the comparison view and Try again, so
    // a missing original (storage was full) does not lose the result.
    const uploadedStored = await assetExists(record.uploadedAssetKey);
    return {
      file: {
        ...fileRecord,
        remediatedBytes: remediatedAsset.bytes,
        remediatedBytesStored: true,
        uploadedBytesStored: uploadedStored
      } satisfies FileEntry
    };
  }

  const uploadedAsset = await requestToPromise(assetStore.get(record.uploadedAssetKey)) as PersistedAssetRecord | undefined;
  if (!uploadedAsset?.bytes) return { droppedId: record.id };
  return {
    file: {
      ...fileRecord,
      uploadedBytes: uploadedAsset.bytes,
      uploadedBytesStored: true,
      remediatedBytesStored: record.remediatedAssetKey ? false : undefined
    } satisfies FileEntry
  };
}

/** Give records written before retention existed a timestamp, so they expire too. */
async function stampLegacyRecords(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const database = await openDatabase();
  try {
    const transaction = database.transaction([FILE_STORE], 'readwrite');
    const done = transactionToPromise(transaction);
    const fileStore = transaction.objectStore(FILE_STORE);
    const savedAt = new Date().toISOString();
    for (const id of ids) {
      // Re-read inside this transaction so a save made since loading wins.
      const record = await requestToPromise(fileStore.get(id));
      if (isPersistedFileRecord(record) && !record.savedAt) {
        fileStore.put({ ...record, savedAt } satisfies PersistedFileRecord);
      }
    }
    await done;
  } finally {
    database.close();
  }
}

/**
 * Load saved files. The original upload is only read into memory for files
 * that have no remediated PDF yet; for finished files it stays in storage and
 * is loaded on demand with loadAssetBytes().
 */
export async function loadPersistedFiles(): Promise<LoadPersistedFilesResult> {
  const database = await openDatabase();
  const legacyIds: string[] = [];
  let result: LoadPersistedFilesResult;

  try {
    const transaction = database.transaction([FILE_STORE, ASSET_STORE], 'readonly');
    const fileStore = transaction.objectStore(FILE_STORE);
    const assetStore = transaction.objectStore(ASSET_STORE);
    const rawRecords = await requestToPromise(fileStore.getAll());
    const fileRecords = (Array.isArray(rawRecords) ? rawRecords : []).filter(isPersistedFileRecord);
    const now = Date.now();
    const expiredIds: string[] = [];
    const liveRecords: PersistedFileRecord[] = [];

    for (const record of fileRecords) {
      if (isExpired(record, now)) {
        expiredIds.push(record.id);
        continue;
      }
      if (!record.savedAt) legacyIds.push(record.id);
      liveRecords.push(record);
    }

    const hydratedFiles = await Promise.all(liveRecords.map((record) => hydrateRecord(record, assetStore)));

    const files: FileEntry[] = [];
    const droppedIds: string[] = [];
    for (const hydrated of hydratedFiles) {
      if (hydrated.file) files.push(hydrated.file);
      if (hydrated.droppedId) droppedIds.push(hydrated.droppedId);
    }

    result = { files, droppedIds, expiredIds };
  } finally {
    database.close();
  }

  await stampLegacyRecords(legacyIds).catch((err) => {
    console.error('[file-store] Failed to stamp saved files for retention:', err);
  });
  return result;
}

/**
 * Load one saved file, e.g. after another tab changed it. Returns undefined
 * when it is gone. Without `loadBytes` no PDF is read into memory; the
 * returned entry only says which PDFs are stored.
 */
export async function loadPersistedFile(fileId: string, options: { loadBytes: boolean } = { loadBytes: true }): Promise<FileEntry | undefined> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction([FILE_STORE, ASSET_STORE], 'readonly');
    const record = await requestToPromise(transaction.objectStore(FILE_STORE).get(fileId));
    if (!isPersistedFileRecord(record)) return undefined;
    const hydrated = await hydrateRecord(record, transaction.objectStore(ASSET_STORE), options);
    return hydrated.file;
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
    const { uploadedBytes, remediatedBytes, persistError, uploadedBytesStored, remediatedBytesStored, ...record } = entry;
    const assets = options.assets ?? {};
    // In-memory bytes may have been released, so the stored remediated PDF is
    // still the record's asset unless this save deletes it.
    const hasRemediatedAsset = assets.remediated === null ? false : Boolean(assets.remediated ?? remediatedBytes ?? entry.remediationCompletedAt);

    const done = transactionToPromise(transaction);

    try {
      fileStore.put({
        ...record,
        uploadedAssetKey: uploadedAssetKey(entry.id),
        remediatedAssetKey: hasRemediatedAsset ? remediatedAssetKey(entry.id) : undefined,
        savedAt: new Date().toISOString()
      } satisfies PersistedFileRecord);

      if (assets.uploaded) {
        assetStore.put({ key: uploadedAssetKey(entry.id), bytes: assets.uploaded } satisfies PersistedAssetRecord);
      }
      if (assets.remediated) {
        assetStore.put({ key: remediatedAssetKey(entry.id), bytes: assets.remediated } satisfies PersistedAssetRecord);
      } else if (assets.remediated === null) {
        assetStore.delete(remediatedAssetKey(entry.id));
      }
    } catch (error) {
      // A synchronous failure (e.g. a clone or quota error) must not leave
      // the record committed without its PDFs: write all of it or nothing.
      done.catch(() => undefined);
      try {
        transaction.abort();
      } catch {
        // Already finished or aborted.
      }
      throw error;
    }

    await done;
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

/** Delete every saved file and PDF from this browser. */
export async function clearAllStoredFiles(): Promise<void> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction([FILE_STORE, ASSET_STORE], 'readwrite');
    transaction.objectStore(FILE_STORE).clear();
    transaction.objectStore(ASSET_STORE).clear();
    await transactionToPromise(transaction);
  } finally {
    database.close();
  }
}
