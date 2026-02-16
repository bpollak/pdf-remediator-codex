import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/stores/app-store';

describe('app store source bytes', () => {
  beforeEach(() => {
    useAppStore.setState({ files: [] });
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
});
