/**
 * Each upload is stored with its remediated copy and parsed data, so it needs
 * roughly this many times its own size in browser storage.
 */
export const STORAGE_HEADROOM_FACTOR = 3;

export interface StoragePlan<T> {
  accepted: T[];
  /** Files that would not fit in the browser storage that is left. */
  refused: T[];
  availableBytes?: number;
}

/**
 * Split files into the ones that fit in the browser's remaining storage and
 * the ones that don't. When the browser can't tell us, accept everything and
 * rely on the save errors shown on each file card.
 */
export async function planUploadsForStorage<T extends { size: number }>(files: T[]): Promise<StoragePlan<T>> {
  let estimate: StorageEstimate | undefined;
  try {
    estimate = await navigator.storage?.estimate?.();
  } catch {
    estimate = undefined;
  }
  if (!estimate || typeof estimate.quota !== 'number' || typeof estimate.usage !== 'number') {
    return { accepted: files, refused: [] };
  }

  let availableBytes = Math.max(0, estimate.quota - estimate.usage);
  const reportedAvailable = availableBytes;
  const accepted: T[] = [];
  const refused: T[] = [];
  for (const file of files) {
    const needed = file.size * STORAGE_HEADROOM_FACTOR;
    if (needed <= availableBytes) {
      accepted.push(file);
      availableBytes -= needed;
    } else {
      refused.push(file);
    }
  }
  return { accepted, refused, availableBytes: reportedAvailable };
}

let persistRequested = false;

/** Ask the browser once per page load not to evict saved PDFs under storage pressure. */
export function requestPersistentStorageOnce(): void {
  if (persistRequested || typeof navigator === 'undefined') return;
  persistRequested = true;
  void navigator.storage?.persist?.().catch(() => false);
}
