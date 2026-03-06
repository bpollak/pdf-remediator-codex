import type { FileEntry } from '@/types/file-entry';

const DB_NAME = 'accessible-pdf';
const DB_VERSION = 1;
const FILE_STORE = 'files';
const ASSET_STORE = 'assets';

interface PersistedFileRecord extends Omit<FileEntry, 'uploadedBytes' | 'remediatedBytes'> {
  uploadedAssetKey: string;
  remediatedAssetKey?: string;
}

interface PersistedAssetRecord {
  key: string;
  bytes: ArrayBuffer;
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

export async function loadPersistedFiles(): Promise<FileEntry[]> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction([FILE_STORE, ASSET_STORE], 'readonly');
    const fileStore = transaction.objectStore(FILE_STORE);
    const assetStore = transaction.objectStore(ASSET_STORE);
    const fileRecords = await requestToPromise(fileStore.getAll()) as PersistedFileRecord[];

    const hydratedFiles = await Promise.all(
      fileRecords.map(async (record) => {
        const uploadedAsset = await requestToPromise(assetStore.get(record.uploadedAssetKey)) as PersistedAssetRecord | undefined;
        if (!uploadedAsset?.bytes) return undefined;

        const remediatedAsset = record.remediatedAssetKey
          ? (await requestToPromise(assetStore.get(record.remediatedAssetKey)) as PersistedAssetRecord | undefined)
          : undefined;
        const { uploadedAssetKey: _uploadedAssetKey, remediatedAssetKey: _remediatedAssetKey, ...fileRecord } = record;

        return {
          ...fileRecord,
          uploadedBytes: uploadedAsset.bytes,
          remediatedBytes: remediatedAsset?.bytes
        } satisfies FileEntry;
      })
    );

    return hydratedFiles.filter((file): file is FileEntry => Boolean(file));
  } finally {
    database.close();
  }
}

export async function saveFileEntry(entry: FileEntry): Promise<void> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction([FILE_STORE, ASSET_STORE], 'readwrite');
    const fileStore = transaction.objectStore(FILE_STORE);
    const assetStore = transaction.objectStore(ASSET_STORE);
    const { uploadedBytes, remediatedBytes, ...record } = entry;
    const nextUploadedAssetKey = uploadedAssetKey(entry.id);
    const nextRemediatedAssetKey = remediatedBytes ? remediatedAssetKey(entry.id) : undefined;

    fileStore.put({
      ...record,
      uploadedAssetKey: nextUploadedAssetKey,
      remediatedAssetKey: nextRemediatedAssetKey
    } satisfies PersistedFileRecord);

    assetStore.put({
      key: nextUploadedAssetKey,
      bytes: uploadedBytes
    } satisfies PersistedAssetRecord);

    if (remediatedBytes && nextRemediatedAssetKey) {
      assetStore.put({
        key: nextRemediatedAssetKey,
        bytes: remediatedBytes
      } satisfies PersistedAssetRecord);
    } else {
      assetStore.delete(remediatedAssetKey(entry.id));
    }

    await transactionToPromise(transaction);
  } finally {
    database.close();
  }
}
