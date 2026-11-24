/**
 * Lifecycle glue for the durable active-session mirror.
 *
 * Both the pomodoro and traveler timers recover a running session after a
 * reload or crash and refresh its heartbeat while it runs. The restore
 * decisions live in `@/lib/active-session`; this hook only owns the three
 * effects that apply them, so the two techniques cannot drift apart on toast
 * handling, restore ordering or heartbeat behaviour.
 */

import { useEffect, useRef } from 'react';
import {
  ACTIVE_SESSION_HEARTBEAT_MS,
  clearActiveSession,
  loadActiveSession,
  saveActiveSession,
  type RestoreOutcome,
  type StoredActiveSession,
} from '@/lib/active-session';

export interface ActiveSessionPersistenceConfig<T, S> {
  /** Storage namespace, e.g. 'pomodoro' or 'traveler'. */
  kind: string;
  userId: string | null | undefined;
  /** Restore waits until settings and the user id are loaded. */
  ready: boolean;
  /** Latest persistable session, or null when nothing is running. */
  snapshot: () => T | null;
  /** Changes whenever the persisted payload changes; drives re-mirroring. */
  persistToken: string;
  /** True only while the phase advances (not idle, not paused). */
  isRunning: boolean;
  resolve: (stored: StoredActiveSession<T>, now: number) => RestoreOutcome<S>;
  onRestore: (state: S, stored: StoredActiveSession<T>) => void;
  onExpired: (stored: StoredActiveSession<T>, endTime: number, completed: boolean) => void;
}

export function useActiveSessionPersistence<T, S>(
  config: ActiveSessionPersistenceConfig<T, S>,
): void {
  const restoredRef = useRef(false);
  // Always read the latest callbacks without re-running the restore effect.
  const configRef = useRef(config);
  configRef.current = config;
  const { kind, userId, ready, persistToken, isRunning } = config;

  // ---- Restore a session after a reload/crash ----
  useEffect(() => {
    if (restoredRef.current || !userId || !ready) return;
    restoredRef.current = true;

    const c = configRef.current;
    const stored = loadActiveSession<T>(c.kind, userId);
    if (!stored) return;

    const outcome = c.resolve(stored, Date.now());
    clearActiveSession(c.kind, userId);
    if (outcome.kind === 'discard') return;
    if (outcome.kind === 'expired') {
      c.onExpired(stored, outcome.endTime, outcome.completed);
      return;
    }
    c.onRestore(outcome.state, stored);
  }, [userId, ready]);

  // ---- Mirror the running session so a reload/crash can recover it ----
  useEffect(() => {
    if (!userId || !restoredRef.current) return;
    const data = configRef.current.snapshot();
    if (data === null) {
      clearActiveSession(kind, userId);
      return;
    }
    saveActiveSession<T>(kind, userId, data);
  }, [userId, kind, persistToken]);

  // ---- Refresh `savedAt` while running so a crash records known-alive time ----
  useEffect(() => {
    if (!userId || !restoredRef.current || !isRunning) return;
    const id = setInterval(() => {
      const data = configRef.current.snapshot();
      if (data !== null) saveActiveSession<T>(kind, userId, data);
    }, ACTIVE_SESSION_HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [userId, kind, isRunning]);
}
