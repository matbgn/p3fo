let tail: Promise<unknown> = Promise.resolve();

/**
 * Serialize sprint state read-modify-write operations. The auto-close
 * scheduler, manual close, start, and PUT all mutate the same persisted
 * document, so they must not interleave their reads and writes.
 */
export function withSprintStateLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.then(() => undefined, () => undefined);
  return run;
}
