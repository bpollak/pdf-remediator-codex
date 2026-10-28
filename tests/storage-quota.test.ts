import { afterEach, describe, expect, it, vi } from 'vitest';

describe('browser storage checks', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('accepts uploads while they fit and names the ones that do not', async () => {
    vi.stubGlobal('navigator', { storage: { estimate: async () => ({ quota: 1_000, usage: 100 }) } });
    const { planUploadsForStorage, STORAGE_HEADROOM_FACTOR } = await import('@/lib/persistence/storage-quota');

    const plan = await planUploadsForStorage([
      { name: 'a.pdf', size: 100 },
      { name: 'b.pdf', size: 250 },
      { name: 'c.pdf', size: 100 }
    ]);
    expect(STORAGE_HEADROOM_FACTOR).toBe(3);
    // 900 free: a needs 300, b needs 750 (refused), c needs 300.
    expect(plan.accepted.map((file) => file.name)).toEqual(['a.pdf', 'c.pdf']);
    expect(plan.refused.map((file) => file.name)).toEqual(['b.pdf']);
    expect(plan.availableBytes).toBe(900);
  });

  it('accepts everything when the browser cannot estimate storage', async () => {
    vi.stubGlobal('navigator', {});
    const { planUploadsForStorage } = await import('@/lib/persistence/storage-quota');
    expect((await planUploadsForStorage([{ size: 1e12 }])).refused).toEqual([]);
  });

  it('asks for persistent storage once, not on every upload', async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', { storage: { persist } });
    const { requestPersistentStorageOnce } = await import('@/lib/persistence/storage-quota');

    requestPersistentStorageOnce();
    requestPersistentStorageOnce();
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
