import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileEntry } from '@/types/file-entry';

const { saveFileEntry } = vi.hoisted(() => ({
  saveFileEntry: vi.fn(() => Promise.resolve())
}));

vi.mock('@/lib/persistence/file-store', () => ({
  loadPersistedFiles: vi.fn(() => Promise.resolve([])),
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
      { persistAssets: false }
    );
  });

  it('rewrites assets when the stored PDF bytes change', () => {
    useAppStore.getState().updateFile('file-1', {
      remediatedBytes: new ArrayBuffer(16)
    });

    expect(saveFileEntry).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'file-1' }),
      { persistAssets: true }
    );
  });
});
