import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FileEntry } from '@/types/file-entry';

/** A minimal Web Locks implementation shared by every "tab" in the test. */
function createLockManager() {
  let holder: object | null = null;
  const waiting: Array<() => void> = [];

  async function request(name: string, optionsOrCallback: unknown, maybeCallback?: unknown) {
    const callback = (typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback) as (lock: unknown) => unknown;
    const options = (typeof optionsOrCallback === 'function' ? {} : optionsOrCallback) as { ifAvailable?: boolean };
    if (holder && options.ifAvailable) return callback(null);
    if (holder) await new Promise<void>((resolve) => waiting.push(resolve));
    const lock = { name };
    holder = lock;
    try {
      return await callback(lock);
    } finally {
      holder = null;
      waiting.shift()?.();
    }
  }

  return {
    request,
    query: async () => ({ held: holder ? [{ name: 'accessible-pdf-queue' }] : [], pending: [] })
  };
}

const globals = globalThis as unknown as { window?: unknown };

async function openTab(locks?: ReturnType<typeof createLockManager>) {
  vi.resetModules();
  if (locks) vi.stubGlobal('navigator', { locks });
  const store = await import('@/stores/app-store');
  const queue = await import('@/components/upload/QueueProcessor');
  const tabSync = await import('@/lib/client/tab-sync');
  await store.useAppStore.getState().hydrateFromPersistence();
  return { useAppStore: store.useAppStore, pumpQueue: queue.pumpQueue, tabSync };
}

describe('two tabs', () => {
  beforeAll(() => {
    globals.window = globalThis;
  });

  afterAll(() => {
    delete globals.window;
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.doUnmock('@/lib/workers/client');
    const { clearAllStoredFiles } = await import('@/lib/persistence/file-store');
    await clearAllStoredFiles();
  });

  it('refreshes from changes saved in another tab instead of overwriting them', async () => {
    const fs = await import('@/lib/persistence/file-store');
    const base: FileEntry = {
      id: 'f1',
      name: 'a.pdf',
      size: 3,
      status: 'remediated',
      progress: 100,
      remediationCompletedAt: 'x',
      parsedData: { pageCount: 1, metadata: {}, hasStructTree: false, tags: [], textItems: [], images: [{ id: 'img-1', page: 1, x: 0, y: 0, width: 10, height: 10 }], links: [], outlines: [], forms: [] }
    };
    await fs.saveFileEntry(base, { assets: { uploaded: new ArrayBuffer(3), remediated: new ArrayBuffer(3) } });

    const tabA = await openTab();
    const tabB = await openTab();
    tabA.useAppStore.getState().updateAltTextDraft('f1', 'img-1', { alt: 'A chart of enrollment', decorative: false });
    await vi.waitFor(() =>
      expect(tabB.useAppStore.getState().files[0]?.manualReviewDrafts?.altText['img-1']?.alt).toBe('A chart of enrollment')
    );

    tabB.useAppStore.getState().markWorkflowProgress('f1', { downloadedAt: 'now' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const { files } = await fs.loadPersistedFiles();
    expect(files[0]?.manualReviewDrafts?.altText['img-1']?.alt).toBe('A chart of enrollment');
    expect(files[0]?.workflowProgress?.downloadedAt).toBe('now');
  });

  it('runs the queue in one tab only; the other shows its files as waiting', async () => {
    const parseCalls: string[] = [];
    const fs = await import('@/lib/persistence/file-store');
    await fs.saveFileEntry({ id: 'q1', name: 'q.pdf', size: 3, status: 'queued', progress: 0 }, { assets: { uploaded: new ArrayBuffer(3) } });
    const locks = createLockManager();

    const tabs = [];
    for (const name of ['A', 'B']) {
      vi.doMock('@/lib/workers/client', () => ({
        parsePdfInWorker: vi.fn(() => {
          parseCalls.push(name);
          return new Promise(() => undefined);
        }),
        runAuditInWorker: vi.fn(),
        remediatePdfInWorker: vi.fn()
      }));
      const tab = await openTab(locks);
      tab.pumpQueue();
      tabs.push(tab);
      await vi.waitFor(() => expect(tab.tabSync.isQueueLeader() || tab.useAppStore.getState().processingInOtherTab).toBe(true));
    }

    await vi.waitFor(() => expect(parseCalls).toEqual(['A']));
    const [tabA, tabB] = tabs;
    expect(tabA!.tabSync.isQueueLeader()).toBe(true);
    expect(tabB!.tabSync.isQueueLeader()).toBe(false);
    expect(tabB!.useAppStore.getState().processingInOtherTab).toBe(true);
    // Tab B leaves tab A's running file alone rather than calling it interrupted.
    tabB!.pumpQueue();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(tabB!.useAppStore.getState().files[0]?.status).not.toBe('error');
    expect(parseCalls).toEqual(['A']);
  });
});
