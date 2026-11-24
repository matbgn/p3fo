/**
 * Durable storage and restore decisions for the one running pomodoro/traveler
 * session.
 *
 * The timers themselves live in React state, which a reload or crash would
 * otherwise discard. Each session is mirrored per user into localStorage so it
 * can be resumed on reopen, or finalized into a recorded session if the phase
 * ended while the tab was gone. This is device-local durability only; the
 * cross-device presence channel remains ephemeral over Yjs awareness.
 */

import type { PomodoroState } from './pomodoro-types';
import type { TravelerState } from './traveler-types';

export const ACTIVE_SESSION_HEARTBEAT_MS = 30_000;
/** Ignore sessions that have not been touched for this long. */
export const MAX_ACTIVE_SESSION_AGE_MS = 12 * 60 * 60 * 1000;

const VERSION = 1;

export interface StoredActiveSession<T> {
  v: number;
  /** Last time the running tab was known alive (heartbeat) or changed. */
  savedAt: number;
  data: T;
}

function storageKey(kind: string, userId: string | null | undefined): string {
  return `p3fo_active_${kind}:${userId || 'anonymous'}`;
}

function getStorage(): Storage | null {
  // Use window.localStorage rather than the bare global: some runtimes expose
  // a placeholder `localStorage` global that is not the DOM storage.
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveActiveSession<T>(
  kind: string,
  userId: string | null | undefined,
  data: T,
): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const record: StoredActiveSession<T> = { v: VERSION, savedAt: Date.now(), data };
    storage.setItem(storageKey(kind, userId), JSON.stringify(record));
  } catch {
    // Quota/private-mode failures must never break the timer.
  }
}

export function loadActiveSession<T>(
  kind: string,
  userId: string | null | undefined,
  maxAgeMs: number = MAX_ACTIVE_SESSION_AGE_MS,
): StoredActiveSession<T> | null {
  const storage = getStorage();
  if (!storage || !userId) return null;
  try {
    const raw = storage.getItem(storageKey(kind, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredActiveSession<T>>;
    if (
      parsed.v !== VERSION ||
      typeof parsed.savedAt !== 'number' ||
      !Number.isFinite(parsed.savedAt) ||
      parsed.data === undefined ||
      parsed.data === null
    ) {
      storage.removeItem(storageKey(kind, userId));
      return null;
    }
    if (Date.now() - parsed.savedAt > maxAgeMs) {
      storage.removeItem(storageKey(kind, userId));
      return null;
    }
    return { v: parsed.v, savedAt: parsed.savedAt, data: parsed.data as T };
  } catch {
    return null;
  }
}

export function clearActiveSession(
  kind: string,
  userId: string | null | undefined,
): void {
  const storage = getStorage();
  if (!storage || !userId) return;
  try {
    storage.removeItem(storageKey(kind, userId));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Restore decisions
// ---------------------------------------------------------------------------

export interface StoredPomodoroSessionData {
  state: PomodoroState;
  taskId?: string;
  /** Phase duration at save time; the current config may have changed. */
  durationMs: number;
}

export interface StoredTravelerSessionData {
  state: TravelerState;
}

export type RestoreOutcome<S> =
  | { kind: 'restore'; state: S }
  /**
   * The phase ended before the tab was reopened. `completed` is true only when
   * the credited end reached the full phase; a session cut short by the tab
   * going away is finalized with its known-alive time but must not be counted
   * as a finished pomodoro.
   */
  | { kind: 'expired'; endTime: number; completed: boolean }
  | { kind: 'discard' };

/**
 * Stable id for a recorded session, derived from its identity rather than a
 * random UUID. A crash-restore or a second tab that resumes the same session
 * computes the same id, so the persistence layer can collapse the duplicate
 * instead of inserting two indistinguishable rows for the same work.
 */
export function sessionRecordId(
  kind: string,
  userId: string,
  phase: string,
  startedAt: number,
): string {
  return `${kind}:${userId}:${phase}:${startedAt}`;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Duration of the currently selected traveler phase.
 *
 * Shared by the live countdown (`useTravelerTimer`) and the restore decision
 * below, so the on-screen timer and the finalized session can never disagree
 * about how long the phase runs.
 */
export function travelerPhaseDurationMs(
  state: Pick<TravelerState, 'phase' | 'travelDurationMs' | 'breakDurationMs'>,
): number {
  if (state.phase === 'idle') return 0;
  return state.phase === 'work' ? state.travelDurationMs : state.breakDurationMs;
}

type DurationOutcome =
  | { kind: 'active' }
  | { kind: 'discard' }
  | { kind: 'expired'; endTime: number; completed: boolean };

/**
 * Shared expiry rule for pomodoro and traveler sessions.
 *
 * `savedAt` is the last heartbeat from the running tab. If the phase ended
 * while the tab was gone, only the time the tab is known to have been alive is
 * credited — the offline gap must not inflate the session — and a session the
 * tab was known to be alive through counts as complete. Keeping this in one
 * place prevents the two techniques from silently disagreeing on what counts
 * as a completed session.
 */
function evaluateDuration(
  startedAt: number,
  pausedAt: number | null,
  pausedElapsed: number,
  duration: number,
  savedAt: number,
  now: number,
  heartbeatMs: number,
): DurationOutcome {
  const elapsed = pausedAt !== null ? pausedElapsed : now - startedAt;
  const remaining = duration - elapsed;

  if (pausedAt === null && remaining <= 0) {
    const fullEnd = startedAt + duration;
    const endTime = Math.min(fullEnd, savedAt + heartbeatMs);
    if (endTime <= startedAt) return { kind: 'discard' };
    return { kind: 'expired', endTime, completed: endTime >= fullEnd };
  }

  return { kind: 'active' };
}

/**
 * The restored state carries the persisted duration as its override, so the
 * countdown is exact even if settings have not loaded yet or have changed.
 */
export function resolvePomodoroRestore(
  stored: StoredPomodoroSessionData,
  savedAt: number,
  now: number,
  heartbeatMs: number = ACTIVE_SESSION_HEARTBEAT_MS,
): RestoreOutcome<PomodoroState> {
  const s = stored.state;
  if (
    !s ||
    s.phase === 'idle' ||
    s.startedAt === null ||
    !isFinitePositive(stored.durationMs)
  ) {
    return { kind: 'discard' };
  }

  const outcome = evaluateDuration(
    s.startedAt,
    s.pausedAt,
    s.pausedElapsed,
    stored.durationMs,
    savedAt,
    now,
    heartbeatMs,
  );
  if (outcome.kind === 'discard') return { kind: 'discard' };
  if (outcome.kind === 'expired') {
    return { kind: 'expired', endTime: outcome.endTime, completed: outcome.completed };
  }

  return {
    kind: 'restore',
    state: { ...s, durationOverrideMs: stored.durationMs },
  };
}

export function resolveTravelerRestore(
  stored: StoredTravelerSessionData,
  savedAt: number,
  now: number,
  heartbeatMs: number = ACTIVE_SESSION_HEARTBEAT_MS,
): RestoreOutcome<TravelerState> {
  const s = stored.state;
  if (!s || s.phase === 'idle' || s.startedAt === null) {
    return { kind: 'discard' };
  }

  const duration = travelerPhaseDurationMs(s);
  if (!isFinitePositive(duration)) return { kind: 'discard' };

  const outcome = evaluateDuration(
    s.startedAt,
    s.pausedAt,
    s.pausedElapsed,
    duration,
    savedAt,
    now,
    heartbeatMs,
  );
  if (outcome.kind === 'discard') return { kind: 'discard' };
  if (outcome.kind === 'expired') {
    return { kind: 'expired', endTime: outcome.endTime, completed: outcome.completed };
  }

  return { kind: 'restore', state: s };
}
