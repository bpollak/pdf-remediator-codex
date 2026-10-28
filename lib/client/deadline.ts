/** Thrown when a processing step runs past its deadline. */
export class StepTimeoutError extends Error {
  constructor(readonly step: string, readonly timeoutMs: number) {
    super(`${step} did not finish within ${Math.round(timeoutMs / 1000)} seconds.`);
    this.name = 'StepTimeoutError';
  }
}

export function createAbortError(): DOMException {
  return new DOMException('Processing was cancelled.', 'AbortError');
}

export function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw createAbortError();
}

/**
 * Settle with `work`, or reject when the deadline passes or `signal` aborts.
 * Work that can't be interrupted (pdf.js and pdf-lib on the main thread)
 * keeps running in the background, but the caller is free to move on, so one
 * stalled step can't hold the processing queue forever.
 */
export function withDeadline<T>(
  work: Promise<T>,
  options: { step: string; timeoutMs: number; signal?: AbortSignal }
): Promise<T> {
  const { step, timeoutMs, signal } = options;
  if (signal?.aborted) {
    work.catch(() => undefined);
    return Promise.reject(createAbortError());
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new StepTimeoutError(step, timeoutMs));
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      }
    );
  });
}

/**
 * A signal that aborts when `parent` aborts or after `timeoutMs`, for fetches.
 * Call `dispose` when the request settles.
 */
export function deadlineSignal(timeoutMs: number, parent?: AbortSignal): { signal: AbortSignal; dispose: () => void; timedOut: () => boolean } {
  const controller = new AbortController();
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, timeoutMs);
  const onParentAbort = () => controller.abort();
  if (parent?.aborted) controller.abort();
  else parent?.addEventListener('abort', onParentAbort, { once: true });

  return {
    signal: controller.signal,
    timedOut: () => expired,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', onParentAbort);
    }
  };
}

/** Resolve after `ms`, or reject early if `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(createAbortError());
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
