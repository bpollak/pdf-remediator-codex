import 'fake-indexeddb/auto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STORED_FILE_RETENTION_DAYS,
  clearAllStoredFiles,
  loadAssetBytes,
  loadPersistedFiles,
  saveFileEntry
} from '@/lib/persistence/file-store';
import { useAppStore } from '@/stores/app-store';
import { INTERRUPTED_MESSAGE } from '@/lib/client/error-copy';
import type { FileEntry } from '@/types/file-entry';

function bytes(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

function entry(overrides: Partial<FileEntry> = {}): FileEntry {
  return { id: 'file-1', name: 'a.pdf', size: 10, status: 'queued', progress: 0, ...overrides };
}

const globals = globalThis as unknown as { window?: unknown };
const flush = () => new Promise((resolve) => setTimeout(resolve, 30));

describe('app store recovery and storage', () => {
  beforeAll(() => {
    // hydrateFromPersistence only runs in a browser.
    globals.window = globalThis;
  });

  afterAll(() => {
    delete globals.window;
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await clearAllStoredFiles();
    useAppStore.setState({ files: [], hydrated: false, expiredFileCount: 0, previewFocusByFileId: {} });
  });

  it('restores a file interrupted mid-processing as an error with Try again, instead of restarting it', async () => {
    await saveFileEntry(
      entry({ status: 'remediating', progress: 80, processingAttempts: 1, processingStartedAt: '2026-10-28T10:00:00Z' }),
      { assets: { uploaded: bytes('%PDF-original') } }
    );

    await useAppStore.getState().hydrateFromPersistence();
    const restored = useAppStore.getState().files[0]!;
    expect(restored).toMatchObject({ status: 'error', errorCode: 'interrupted', error: INTERRUPTED_MESSAGE, uploadedBytesStored: true });

    // The error is saved, so the next visit doesn't treat it as running.
    await flush();
    expect((await loadPersistedFiles()).files[0]?.status).toBe('error');

    useAppStore.getState().retryFile('file-1');
    expect(useAppStore.getState().files[0]).toMatchObject({ status: 'queued', error: undefined, errorCode: undefined });
  });

  it('still auto-starts files that were queued but never started', async () => {
    await saveFileEntry(entry(), { assets: { uploaded: bytes('%PDF-original') } });
    await useAppStore.getState().hydrateFromPersistence();
    expect(useAppStore.getState().files[0]?.status).toBe('queued');
  });

  it('retries saving the original after storage was full and keeps the warning until it is stored', async () => {
    const realPut = IDBObjectStore.prototype.put;
    let failuresLeft = 2;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      const assetKey = (value as { key?: unknown } | null)?.key;
      if (failuresLeft > 0 && typeof assetKey === 'string' && assetKey.endsWith(':uploaded')) {
        failuresLeft -= 1;
        throw new DOMException('quota', 'QuotaExceededError');
      }
      return realPut.call(this, value, key);
    });
    useAppStore.setState({ hydrated: true });

    await useAppStore.getState().addFiles([new File([new Uint8Array([37, 80, 68, 70, 45])], 'a.pdf', { type: 'application/pdf' })]);
    await vi.waitFor(() => expect(useAppStore.getState().files[0]?.persistError).toMatch(/out of storage space/));
    const id = useAppStore.getState().files[0]!.id;

    // The next save retries the original and fails again: the warning stays.
    useAppStore.getState().updateFile(id, { status: 'auditing', parsedData: { pageCount: 1 } as FileEntry['parsedData'] });
    await flush();
    expect(useAppStore.getState().files[0]?.persistError).toBeTruthy();
    expect(useAppStore.getState().files[0]?.uploadedBytesStored).toBe(false);
    // Nothing half-written: the failed save did not commit the record either.
    expect((await loadPersistedFiles()).files).toHaveLength(0);

    // Bytes the store could not save are never dropped from memory.
    useAppStore.getState().releaseUploadedBytes(id);
    expect(useAppStore.getState().files[0]?.uploadedBytes).toBeDefined();

    useAppStore.getState().updateFile(id, { status: 'remediated', remediatedBytes: bytes('fixed'), remediationCompletedAt: 'now' });
    await vi.waitFor(() => expect(useAppStore.getState().files[0]?.persistError).toBeUndefined());
    expect(useAppStore.getState().files[0]).toMatchObject({ uploadedBytesStored: true, remediatedBytesStored: true });

    const reload = await loadPersistedFiles();
    expect(reload.droppedIds).toEqual([]);
    expect(reload.files.map((file) => file.id)).toEqual([id]);
    expect(await loadAssetBytes(id, 'uploaded')).toBeDefined();
  });

  it('keeps a finished result when only the original is missing from storage', async () => {
    await saveFileEntry(entry({ status: 'remediated', remediationCompletedAt: 'now' }), { assets: { remediated: bytes('fixed') } });

    const { files, droppedIds } = await loadPersistedFiles();
    expect(droppedIds).toEqual([]);
    expect(files[0]).toMatchObject({ id: 'file-1', uploadedBytesStored: false, remediatedBytesStored: true });
  });

  it(`deletes saved files not touched for ${STORED_FILE_RETENTION_DAYS} days when the app loads`, async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'));
    await saveFileEntry(entry({ id: 'old' }), { assets: { uploaded: bytes('old') } });
    vi.setSystemTime(new Date('2026-10-20T00:00:00Z'));
    await saveFileEntry(entry({ id: 'recent' }), { assets: { uploaded: bytes('recent') } });
    vi.setSystemTime(new Date('2026-10-28T00:00:00Z'));

    await useAppStore.getState().hydrateFromPersistence();
    vi.useRealTimers();

    expect(useAppStore.getState().files.map((file) => file.id)).toEqual(['recent']);
    expect(useAppStore.getState().expiredFileCount).toBe(1);
    await vi.waitFor(async () => expect(await loadAssetBytes('old', 'uploaded')).toBeUndefined());
  });

  it('clears every file from storage and the list', async () => {
    await saveFileEntry(entry({ id: 'one' }), { assets: { uploaded: bytes('1') } });
    await saveFileEntry(entry({ id: 'two' }), { assets: { uploaded: bytes('2') } });
    await useAppStore.getState().hydrateFromPersistence();
    expect(useAppStore.getState().files).toHaveLength(2);

    await useAppStore.getState().clearAllFiles();

    expect(useAppStore.getState().files).toEqual([]);
    expect((await loadPersistedFiles()).files).toEqual([]);
    expect(await loadAssetBytes('one', 'uploaded')).toBeUndefined();
  });
});
