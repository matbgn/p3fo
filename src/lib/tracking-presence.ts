/**
 * Ephemeral cross-device tracking presence.
 *
 * Presence rides the existing Yjs awareness channel (`src/lib/collaboration.ts`).
 * It is NEVER written to the shared document and NEVER persisted: awareness drops
 * a client's state when it disconnects (and after its 30s outdated timeout), so
 * "another device is tracking" disappears on its own. Time accounting stays on
 * the task timer and pomodoro/traveler session paths.
 *
 * A takeover is two ephemeral awareness fields: the taker publishes a
 * `takeover` request naming the producer's client and session, and the producer
 * resets its local timer without recording. The taker adopts the session with
 * the original elapsed time, so the phase is continued rather than restarted.
 */

import { useSyncExternalStore } from 'react';

export type TrackingTechnique = 'pomodoro' | 'traveler' | 'task';

export interface TrackingPomodoroState {
  cycleCount: number;
  armedBoost: number;
  activeBoost: number;
}

export interface TrackingTravelerState {
  departure: string;
  destination: string;
  travelMode: 'flight' | 'train';
  travelDurationMs: number;
  breakDurationMs: number;
}

export interface TrackingPresencePayload {
  v: 1;
  /**
   * Stable id for this tracking session. Derived from the session start, so a
   * takeover keeps it: the producer ignores a stop/takeover for another id.
   */
  sessionId: string;
  /**
   * The user whose device is tracking. p3fo boards are multi-user, so viewers
   * only render presence for their own userId — a teammate tracking their own
   * task must not ring this device's play button.
   */
  userId: string;
  taskId: string | null;
  technique: TrackingTechnique;
  /** Technique phase for display ("work", "short-break", "task", ...). */
  phase: string;
  /** Wall-clock ms when the session began. Display only — never accounting. */
  sinceTs: number;
  /** Total duration of the phase. Required for a takeover; absent on tasks. */
  durationMs?: number;
  /** Human-readable producer device label, e.g. "Mac", "Android". */
  deviceLabel: string;
  pomodoro?: TrackingPomodoroState;
  traveler?: TrackingTravelerState;
}

/** A viewer asks the producing client to stop so it can continue the session. */
export interface TrackingTakeoverRequest {
  v: 1;
  targetClientId: number;
  sessionId: string;
  /**
   * The requesting user. A producer only yields to a request from its own
   * user: the shared awareness room carries every connected user, so without
   * this any occupant could force-cancel another user's timer.
   */
  userId: string;
  at: number;
}

/** A task timer this device started, so it is attributed here and not remote. */
export interface LocalTaskTracking {
  taskId: string;
  userId: string;
  sinceTs: number;
}

/** What viewers render: the remote payload plus the owning awareness client. */
export interface RemoteTrackingSession {
  clientId: number;
  payload: TrackingPresencePayload;
}

const MAX_DEVICE_LABEL_LENGTH = 32;
/** Reject oversized remote labels before they reach the sanitizer's full scan. */
const MAX_RAW_DEVICE_LABEL_LENGTH = 128;
const MAX_USER_ID_LENGTH = 128;

/**
 * Largest phase duration accepted from a remote presence payload.
 *
 * This is a sanity bound for untrusted input, not a policy knob: it admits the
 * longest supported traveler session (a multi-day train or the longest direct
 * flight) while rejecting the effectively-unbounded values a forged payload
 * could otherwise inject into an adopted timer and the session it later
 * records. It is deliberately separate from MAX_ACTIVE_SESSION_AGE_MS, which
 * measures how stale a *stored* session is, not how long a live phase may run.
 */
export const MAX_TAKEOVER_PHASE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/** Boost multipliers the pomodoro timer recognizes (`1 | 2 | 3`). */
const POMODORO_BOOST_VALUES = new Set([1, 2, 3]);

const POMODORO_PHASES = new Set(['work', 'short-break', 'long-break']);
const TRAVELER_PHASES = new Set(['work', 'break']);

function isBoostMultiplier(value: unknown): value is number {
  return isFiniteNumber(value) && POMODORO_BOOST_VALUES.has(value);
}

function isFiniteDuration(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0 && value <= MAX_TAKEOVER_PHASE_DURATION_MS;
}

function isKnownPhase(technique: TrackingTechnique, phase: string): boolean {
  if (technique === 'pomodoro') return POMODORO_PHASES.has(phase);
  if (technique === 'traveler') return TRAVELER_PHASES.has(phase);
  return true;
}

export function sanitizeDeviceLabel(value: unknown): string {
  if (typeof value !== 'string') return 'Unknown device';
  const cleaned = Array.from(value)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      // Drop markup delimiters and control characters without a control-char
      // regex (which ESLint flags).
      return code >= 0x20 && code !== 0x7f && ch !== '<' && ch !== '>' && ch !== '&';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.slice(0, MAX_DEVICE_LABEL_LENGTH) : 'Unknown device';
}

/** A friendly, stable label for this device's presence payload. */
export function getDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Unknown device';
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const ua = nav.userAgent || '';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/Linux/i.test(ua)) return 'Linux';
  return sanitizeDeviceLabel(nav.userAgentData?.platform || nav.platform || 'Unknown device');
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPomodoroState(value: unknown): value is TrackingPomodoroState {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<TrackingPomodoroState>;
  return (
    isFiniteNumber(p.cycleCount) &&
    p.cycleCount >= 0 &&
    isBoostMultiplier(p.armedBoost) &&
    isBoostMultiplier(p.activeBoost)
  );
}

function isTravelerState(value: unknown): value is TrackingTravelerState {
  if (!value || typeof value !== 'object') return false;
  const t = value as Partial<TrackingTravelerState>;
  return (
    typeof t.departure === 'string' &&
    typeof t.destination === 'string' &&
    (t.travelMode === 'flight' || t.travelMode === 'train') &&
    isFiniteDuration(t.travelDurationMs) &&
    isFiniteDuration(t.breakDurationMs)
  );
}

export function isTrackingPayload(value: unknown): value is TrackingPresencePayload {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<TrackingPresencePayload>;
  return (
    p.v === 1 &&
    typeof p.sessionId === 'string' &&
    p.sessionId.length > 0 &&
    p.sessionId.length <= 200 &&
    typeof p.userId === 'string' &&
    p.userId.length > 0 &&
    p.userId.length <= MAX_USER_ID_LENGTH &&
    typeof p.sinceTs === 'number' &&
    Number.isFinite(p.sinceTs) &&
    typeof p.deviceLabel === 'string' &&
    p.deviceLabel.length <= MAX_RAW_DEVICE_LABEL_LENGTH &&
    (p.taskId === null || typeof p.taskId === 'string') &&
    (p.technique === 'pomodoro' || p.technique === 'traveler' || p.technique === 'task') &&
    typeof p.phase === 'string' &&
    isKnownPhase(p.technique, p.phase) &&
    (p.durationMs === undefined || isFiniteDuration(p.durationMs)) &&
    (p.pomodoro === undefined || isPomodoroState(p.pomodoro)) &&
    (p.traveler === undefined || isTravelerState(p.traveler))
  );
}

export function isTakeoverRequest(value: unknown): value is TrackingTakeoverRequest {
  if (!value || typeof value !== 'object') return false;
  const r = value as Partial<TrackingTakeoverRequest>;
  return (
    r.v === 1 &&
    isFiniteNumber(r.targetClientId) &&
    typeof r.sessionId === 'string' &&
    r.sessionId.length > 0 &&
    typeof r.userId === 'string' &&
    r.userId.length > 0 &&
    r.userId.length <= MAX_USER_ID_LENGTH &&
    isFiniteNumber(r.at)
  );
}

/**
 * Pick the live remote tracking session that belongs to `localUserId`.
 *
 * `states` is an awareness `getStates()` snapshot. Awareness removes stale
 * client states itself (30s outdated timeout), so a state still present here
 * is live enough to render. Self is skipped, as is any other user's session.
 * With multiple devices tracking for the same user, the newest session wins.
 */
export function deriveRemoteTracking(
  states: Iterable<[number, Record<string, unknown>]>,
  selfClientId: number,
  localUserId: string | null | undefined,
): RemoteTrackingSession | null {
  if (!localUserId) return null;

  let best: RemoteTrackingSession | null = null;
  for (const [clientId, state] of states) {
    if (clientId === selfClientId) continue;
    const raw = state?.tracking;
    if (!isTrackingPayload(raw)) continue;
    if (raw.userId !== localUserId) continue;

    if (!best || raw.sinceTs > best.payload.sinceTs) {
      best = {
        clientId,
        // Treat the remote label as untrusted: React escapes it, but strip
        // markup delimiters and control characters before it reaches a tooltip.
        payload: { ...raw, deviceLabel: sanitizeDeviceLabel(raw.deviceLabel) },
      };
    }
  }
  return best;
}

/**
 * A takeover request aimed at this client's current session, if any. Used by
 * the producing client to yield: it resets its local timer without recording,
 * and the taker continues the session from the original start.
 *
 * Only requests from the same user are honored. The shared awareness room
 * carries every connected user, so a takeover that does not name the local
 * user is treated as foreign and ignored.
 */
export function deriveTakeoverForSelf(
  states: Iterable<[number, Record<string, unknown>]>,
  selfClientId: number,
  sessionId: string,
  localUserId: string | null | undefined,
): TrackingTakeoverRequest | null {
  if (!localUserId) return null;
  let best: TrackingTakeoverRequest | null = null;
  for (const [clientId, state] of states) {
    if (clientId === selfClientId) continue;
    const raw = state?.takeover;
    if (!isTakeoverRequest(raw)) continue;
    if (raw.userId !== localUserId) continue;
    if (raw.targetClientId !== selfClientId || raw.sessionId !== sessionId) continue;
    if (!best || raw.at > best.at) best = raw;
  }
  return best;
}

export interface LocalPresenceInput {
  userId: string | null | undefined;
  pomodoro: {
    phase: string;
    startedAt: number | null;
    pausedAt: number | null;
    currentTaskId?: string;
    durationMs: number;
    cycleCount: number;
    armedBoost: number;
    activeBoost: number;
  };
  traveler: {
    phase: string;
    startedAt: number | null;
    pausedAt: number | null;
    durationMs: number;
    breakDurationMs: number;
    departure: string;
    destination: string;
    travelMode: 'flight' | 'train';
  };
  localTask: LocalTaskTracking | null;
  deviceLabel: string;
}

/**
 * Only a running work phase counts as active tracking. A paused session or a
 * break publishes nothing. Shared by the presence publisher and the local UI
 * so the two cannot disagree about whether this device is the trackers.
 */
export function isRunningWorkPhase(
  phase: string,
  startedAt: number | null,
  pausedAt: number | null,
): boolean {
  return phase === 'work' && startedAt !== null && pausedAt === null;
}

/**
 * Build this device's presence payload from its local timers.
 *
 * Only a running work phase publishes: "another device is tracking time"
 * should mean work is being recorded, not a pause or a break. Priority is
 * pomodoro work, then traveler flight, then a locally-started task timer.
 */
export function deriveLocalPresence(input: LocalPresenceInput): TrackingPresencePayload | null {
  const userId = input.userId ? input.userId.slice(0, MAX_USER_ID_LENGTH) : '';
  if (!userId) return null;

  const pomodoro = input.pomodoro;
  if (isRunningWorkPhase(pomodoro.phase, pomodoro.startedAt, pomodoro.pausedAt)) {
    return {
      v: 1,
      sessionId: `pomodoro:${pomodoro.startedAt}`,
      userId,
      taskId: pomodoro.currentTaskId ?? null,
      technique: 'pomodoro',
      phase: pomodoro.phase,
      sinceTs: pomodoro.startedAt,
      durationMs: pomodoro.durationMs,
      deviceLabel: input.deviceLabel,
      pomodoro: {
        cycleCount: pomodoro.cycleCount,
        armedBoost: pomodoro.armedBoost,
        activeBoost: pomodoro.activeBoost,
      },
    };
  }

  const traveler = input.traveler;
  if (isRunningWorkPhase(traveler.phase, traveler.startedAt, traveler.pausedAt)) {
    return {
      v: 1,
      sessionId: `traveler:${traveler.startedAt}`,
      userId,
      taskId: null,
      technique: 'traveler',
      phase: traveler.phase,
      sinceTs: traveler.startedAt,
      durationMs: traveler.durationMs,
      deviceLabel: input.deviceLabel,
      traveler: {
        departure: traveler.departure,
        destination: traveler.destination,
        travelMode: traveler.travelMode,
        travelDurationMs: traveler.durationMs,
        breakDurationMs: traveler.breakDurationMs,
      },
    };
  }

  if (input.localTask) {
    return {
      v: 1,
      sessionId: `task:${input.localTask.sinceTs}`,
      userId: input.localTask.userId.slice(0, MAX_USER_ID_LENGTH),
      taskId: input.localTask.taskId,
      technique: 'task',
      phase: 'task',
      sinceTs: input.localTask.sinceTs,
      deviceLabel: input.deviceLabel,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Current user for call sites that do not pass it explicitly
// ---------------------------------------------------------------------------

let presenceUserId = '';

/**
 * Set by the presence publisher. Task timer start calls that omit the user id
 * (for example the time-sheet play button) still attribute presence to the
 * right user instead of publishing an unattributable 'anonymous' session.
 */
export function setPresenceUserId(userId: string | null | undefined): void {
  presenceUserId = userId ? userId.slice(0, MAX_USER_ID_LENGTH) : '';
}

export function getPresenceUserId(): string {
  return presenceUserId;
}

// ---------------------------------------------------------------------------
// Locally-started task timer registry
// ---------------------------------------------------------------------------

let localTaskTracking: LocalTaskTracking | null = null;
const listeners = new Set<() => void>();

export function getLocalTaskTracking(): LocalTaskTracking | null {
  return localTaskTracking;
}

export function setLocalTaskTracking(next: LocalTaskTracking | null): void {
  const same =
    localTaskTracking === next ||
    (localTaskTracking !== null &&
      next !== null &&
      localTaskTracking.taskId === next.taskId &&
      localTaskTracking.userId === next.userId &&
      localTaskTracking.sinceTs === next.sinceTs);
  if (same) return;
  localTaskTracking = next;
  listeners.forEach((listener) => listener());
}

/** Clear the registry, or only when it currently points at `taskId`. */
export function clearLocalTaskTracking(taskId?: string): void {
  if (!localTaskTracking) return;
  if (taskId && localTaskTracking.taskId !== taskId) return;
  setLocalTaskTracking(null);
}

export function subscribeLocalTaskTracking(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLocalTaskTracking(): LocalTaskTracking | null {
  return useSyncExternalStore(
    subscribeLocalTaskTracking,
    getLocalTaskTracking,
    getLocalTaskTracking,
  );
}
