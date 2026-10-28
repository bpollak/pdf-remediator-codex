/**
 * Coordination between tabs of the app in the same browser.
 *
 * Only one tab runs the processing queue: it holds a Web Lock for as long as
 * it is open, and the next tab takes over when it closes. Saved changes are
 * announced on a BroadcastChannel so other tabs refresh those files instead
 * of overwriting them with stale copies.
 */

export const QUEUE_LOCK_NAME = 'accessible-pdf-queue';
const CHANNEL_NAME = 'accessible-pdf-files';

export type FileChangeMessage =
  | { type: 'saved'; id: string }
  | { type: 'removed'; ids: string[] }
  | { type: 'cleared' };

type LeadershipState = 'unrequested' | 'waiting' | 'leader';

let leadership: LeadershipState = 'unrequested';
const leadershipListeners = new Set<(state: { leader: boolean; waitingForOtherTab: boolean }) => void>();

function locksApi(): LockManager | undefined {
  return typeof navigator !== 'undefined' ? navigator.locks : undefined;
}

function notifyLeadership(waitingForOtherTab: boolean) {
  for (const listener of leadershipListeners) listener({ leader: leadership === 'leader', waitingForOtherTab });
}

/**
 * Ask to run the queue in this tab. Idempotent. Without the Web Locks API
 * (older browsers, tests) this tab simply runs the queue.
 */
export function requestQueueLeadership(): void {
  if (leadership !== 'unrequested') return;
  const locks = locksApi();
  if (!locks) {
    leadership = 'leader';
    notifyLeadership(false);
    return;
  }

  leadership = 'waiting';
  const holdUntilTabCloses = () => {
    leadership = 'leader';
    notifyLeadership(false);
    // Never resolves: the browser releases the lock when this tab closes.
    return new Promise<void>(() => undefined);
  };

  void locks
    .request(QUEUE_LOCK_NAME, { ifAvailable: true }, (lock) => {
      if (lock) return holdUntilTabCloses();
      // Another tab is running the queue; wait in line behind it.
      notifyLeadership(true);
      void locks.request(QUEUE_LOCK_NAME, holdUntilTabCloses).catch(() => undefined);
      return undefined;
    })
    .catch(() => {
      // Locks can be refused (e.g. some private modes); run the queue here.
      leadership = 'leader';
      notifyLeadership(false);
    });
}

export function isQueueLeader(): boolean {
  return leadership === 'leader';
}

export function onQueueLeadershipChange(
  listener: (state: { leader: boolean; waitingForOtherTab: boolean }) => void
): () => void {
  leadershipListeners.add(listener);
  return () => leadershipListeners.delete(listener);
}

/** True when another tab of the app holds the queue lock right now. */
export async function isQueueRunningInOtherTab(): Promise<boolean> {
  const locks = locksApi();
  if (!locks || leadership === 'leader') return false;
  try {
    const { held } = await locks.query();
    return (held ?? []).some((lock) => lock.name === QUEUE_LOCK_NAME);
  } catch {
    return false;
  }
}

let channel: BroadcastChannel | null | undefined;

function getChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);
  // Node (tests) would otherwise keep the process alive for the channel.
  (channel as { unref?: () => void } | null)?.unref?.();
  return channel;
}

export function broadcastFileChange(message: FileChangeMessage): void {
  try {
    getChannel()?.postMessage(message);
  } catch {
    // A closed channel only means other tabs miss one refresh.
  }
}

/** Listen for changes saved by other tabs. Messages from this tab are not delivered. */
export function subscribeToFileChanges(handler: (message: FileChangeMessage) => void): () => void {
  const target = getChannel();
  if (!target) return () => undefined;
  const listener = (event: MessageEvent<FileChangeMessage>) => {
    if (event.data && typeof event.data === 'object' && 'type' in event.data) handler(event.data);
  };
  target.addEventListener('message', listener);
  return () => target.removeEventListener('message', listener);
}
