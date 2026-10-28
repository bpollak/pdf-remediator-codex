import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileEntry } from '@/types/file-entry';

const { saveFileEntry } = vi.hoisted(() => ({
  saveFileEntry: vi.fn((..._args: unknown[]) => Promise.resolve())
}));

vi.mock('@/lib/persistence/file-store', () => ({
  loadPersistedFiles: vi.fn(() => Promise.resolve({ files: [], droppedIds: [] })),
  saveFileEntry,
  deleteFileEntries: vi.fn(() => Promise.resolve())
}));

import { useAppStore } from '@/stores/app-store';

function makeFile(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    id: 'file-1',
    name: 'sample.pdf',
    size: 1024,
    uploadedBytes: new ArrayBuffer(8),
    remediatedBytes: new ArrayBuffer(8),
    status: 'remediated',
    progress: 100,
    parsedData: {
      pageCount: 1,
      metadata: {},
      hasStructTree: false,
      tags: [],
      textItems: [],
      images: [{ id: 'img-1', page: 1, x: 10, y: 10, width: 100, height: 100 }],
      links: [],
      outlines: [],
      forms: []
    },
    ...overrides
  };
}

describe('app store persistence', () => {
  beforeEach(() => {
    saveFileEntry.mockClear();
    useAppStore.setState({
      files: [makeFile()],
      hydrated: true,
      previewFocusByFileId: {}
    });
  });

  afterEach(() => {
    useAppStore.setState({
      files: [],
      hydrated: false,
      previewFocusByFileId: {}
    });
  });

  it('persists alt-text draft updates without rewriting PDF assets', () => {
    useAppStore.getState().updateAltTextDraft('file-1', 'img-1', {
      alt: 'Scanned certificate header',
      decorative: false
    });

    expect(saveFileEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'file-1',
        manualReviewDrafts: expect.objectContaining({
          altText: {
            'img-1': {
              alt: 'Scanned certificate header',
              decorative: false
            }
          }
        })
      }),
      { assets: {} }
    );
  });

  it('writes only the PDF that changed', () => {
    const remediatedBytes = new ArrayBuffer(16);
    useAppStore.getState().updateFile('file-1', { remediatedBytes });

    expect(saveFileEntry).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'file-1' }),
      { assets: { remediated: remediatedBytes } }
    );
  });

  it('shows a storage error on the file when saving fails', async () => {
    saveFileEntry.mockImplementationOnce(() =>
      Promise.reject(new DOMException('full', 'QuotaExceededError'))
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    useAppStore.getState().updateFile('file-1', { status: 'error', error: 'x' });
    await vi.waitFor(() => {
      expect(useAppStore.getState().files[0].persistError).toMatch(/out of storage space/);
    });
  });

  it('keeps at most ten files per upload and reports the rest', async () => {
    const files = Array.from({ length: 12 }, (_, index) => new File(['%PDF-1.4'], `doc-${index}.pdf`, { type: 'application/pdf' }));
    const result = await useAppStore.getState().addFiles(files);

    expect(result).toEqual({ added: 10, skipped: 2, skippedNames: ['doc-10.pdf', 'doc-11.pdf'] });
    expect(useAppStore.getState().files).toHaveLength(11);
  });
});
