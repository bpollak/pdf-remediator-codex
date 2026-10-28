import { afterEach, describe, expect, it, vi } from 'vitest';

const { parsePdfInWorker } = vi.hoisted(() => ({
  // Never settles: simulates a long parse so the lock stays held.
  parsePdfInWorker: vi.fn((..._args: unknown[]) => new Promise(() => undefined))
}));

vi.mock('@/lib/workers/client', () => ({
  parsePdfInWorker,
  runAuditInWorker: vi.fn(),
  remediatePdfInWorker: vi.fn()
}));
vi.mock('@/lib/persistence/file-store', () => ({
  loadPersistedFiles: vi.fn(() => Promise.resolve({ files: [], droppedIds: [] })),
  saveFileEntry: vi.fn(() => Promise.resolve()),
  deleteFileEntries: vi.fn(() => Promise.resolve()),
  loadAssetBytes: vi.fn(() => Promise.resolve(undefined))
}));

import { pumpQueue } from '@/components/upload/QueueProcessor';
import { useAppStore, type FileEntry } from '@/stores/app-store';

function queued(id: string): FileEntry {
  return { id, name: `${id}.pdf`, size: 8, status: 'queued', progress: 0, uploadedBytes: new ArrayBuffer(8) };
}

const statuses = () => useAppStore.getState().files.map((file) => `${file.id}:${file.status}`);

describe('processing queue', () => {
  afterEach(() => {
    useAppStore.setState({ files: [], hydrated: false });
  });

  it('processes one file at a time however often it is pumped', async () => {
    useAppStore.setState({ files: [queued('a'), queued('b')], hydrated: true });

    pumpQueue();
    pumpQueue();
    await Promise.resolve();
    pumpQueue();

    expect(statuses()).toEqual(['a:parsing', 'b:queued']);
    expect(parsePdfInWorker).toHaveBeenCalledTimes(1);
  });

  it('moves on when the running file is removed', async () => {
    await vi.waitFor(() => expect(useAppStore.getState().files).toHaveLength(0));
    useAppStore.setState({ files: [queued('c'), queued('d')], hydrated: true });
    // The lock from the previous test belongs to a file that no longer exists.
    pumpQueue();
    expect(statuses()).toEqual(['c:parsing', 'd:queued']);

    useAppStore.getState().removeFile('c');
    pumpQueue();

    expect(statuses()).toEqual(['d:parsing']);
  });
});
