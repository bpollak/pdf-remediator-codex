import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteFileEntries, loadAssetBytes, loadPersistedFiles, saveFileEntry } from '@/lib/persistence/file-store';
import type { FileEntry } from '@/types/file-entry';

function bytes(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

function text(buffer: ArrayBuffer | undefined): string | undefined {
  return buffer ? new TextDecoder().decode(buffer) : undefined;
}

function entry(overrides: Partial<FileEntry> = {}): FileEntry {
  return { id: 'file-1', name: 'a.pdf', size: 10, status: 'queued', progress: 0, ...overrides };
}

describe('file store', () => {
  beforeEach(async () => {
    const { files } = await loadPersistedFiles();
    await deleteFileEntries(files.map((file) => file.id).concat('file-1', 'file-2'));
  });

  it('keeps the original upload in storage but not in memory once a remediated PDF exists', async () => {
    await saveFileEntry(entry(), { assets: { uploaded: bytes('original') } });
    await saveFileEntry(entry({ status: 'remediated', remediationCompletedAt: '2026-10-27T00:00:00Z' }), {
      assets: { remediated: bytes('fixed') }
    });

    const { files } = await loadPersistedFiles();
    expect(files).toHaveLength(1);
    expect(files[0].uploadedBytes).toBeUndefined();
    expect(text(files[0].remediatedBytes)).toBe('fixed');
    expect(text(await loadAssetBytes('file-1', 'uploaded'))).toBe('original');
  });

  it('does not drop the stored remediated PDF when a later save has no bytes in memory', async () => {
    await saveFileEntry(entry(), { assets: { uploaded: bytes('original') } });
    await saveFileEntry(entry({ status: 'remediated', remediationCompletedAt: '2026-10-27T00:00:00Z' }), {
      assets: { remediated: bytes('fixed') }
    });
    // A draft edit after the bytes were released from memory.
    await saveFileEntry(entry({ status: 'remediated', remediationCompletedAt: '2026-10-27T00:00:00Z' }), { assets: {} });

    const { files } = await loadPersistedFiles();
    expect(text(files[0].remediatedBytes)).toBe('fixed');
  });

  it('never stores in-memory-only fields, but keeps the processing marker', async () => {
    await saveFileEntry(
      entry({ processingStartedAt: 'now', processingAttempts: 1, persistError: 'oops', uploadedBytesStored: false }),
      { assets: { uploaded: bytes('x') } }
    );
    const { files } = await loadPersistedFiles();
    expect(files[0].processingStartedAt).toBe('now');
    expect(files[0].processingAttempts).toBe(1);
    expect(files[0].persistError).toBeUndefined();
    // Derived from what is actually stored, not from the saved flag.
    expect(files[0].uploadedBytesStored).toBe(true);
  });

  it('reports records whose uploaded PDF is missing', async () => {
    await saveFileEntry(entry({ id: 'file-2' }), { assets: {} });
    const { files, droppedIds } = await loadPersistedFiles();
    expect(files.map((file) => file.id)).not.toContain('file-2');
    expect(droppedIds).toEqual(['file-2']);
  });
});
