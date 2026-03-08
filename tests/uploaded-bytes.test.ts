import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/stores/app-store';
import type { FileEntry } from '@/types/file-entry';

function makeFile(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    id: 'file-1',
    name: 'sample.pdf',
    size: 2048,
    uploadedBytes: new ArrayBuffer(8),
    status: 'remediated',
    progress: 100,
    ...overrides
  };
}

describe('app store source bytes', () => {
  beforeEach(() => {
    useAppStore.setState({ files: [], previewFocusByFileId: {}, hydrated: true });
  });

  it('preserves uploaded bytes after remediation updates', async () => {
    const addFiles = useAppStore.getState().addFiles;
    const sourceBytes = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    const file = new File([sourceBytes], 'source.pdf', { type: 'application/pdf' });

    await addFiles([file]);
    const initial = useAppStore.getState().files[0];
    const initialSnapshot = Array.from(new Uint8Array(initial.uploadedBytes));

    useAppStore.getState().updateFile(initial.id, {
      status: 'remediated',
      progress: 100,
      remediatedBytes: new Uint8Array([9, 9, 9]).buffer
    });

    const updated = useAppStore.getState().files[0];
    expect(Array.from(new Uint8Array(updated.uploadedBytes))).toEqual(initialSnapshot);
  });

  it('stores revised-upload lineage metadata when provided', async () => {
    const addFiles = useAppStore.getState().addFiles;
    const file = new File([new Uint8Array([7, 8, 9]).buffer], 'revised.pdf', { type: 'application/pdf' });

    await addFiles([file], { uploadIntent: 'revalidation', derivedFromFileId: 'base-file-1' });

    const saved = useAppStore.getState().files[0];
    expect(saved.uploadIntent).toBe('revalidation');
    expect(saved.derivedFromFileId).toBe('base-file-1');
  });

  it('removes a saved review together with linked revised uploads', () => {
    useAppStore.setState({
      files: [
        makeFile({ id: 'base', name: 'base.pdf' }),
        makeFile({
          id: 'revision-1',
          name: 'revision-1.pdf',
          uploadIntent: 'revalidation',
          derivedFromFileId: 'base'
        }),
        makeFile({
          id: 'revision-2',
          name: 'revision-2.pdf',
          uploadIntent: 'revalidation',
          derivedFromFileId: 'revision-1'
        }),
        makeFile({ id: 'other', name: 'other.pdf' })
      ],
      previewFocusByFileId: {
        base: { page: 1, label: 'Base' },
        'revision-1': { page: 2, label: 'Revision 1' },
        other: { page: 3, label: 'Other' }
      }
    });

    useAppStore.getState().removeFile('base');

    expect(useAppStore.getState().files.map((file) => file.id)).toEqual(['other']);
    expect(useAppStore.getState().previewFocusByFileId).toEqual({
      other: { page: 3, label: 'Other' }
    });
  });
});
