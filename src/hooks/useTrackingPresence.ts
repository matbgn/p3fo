import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { awareness } from '@/lib/collaboration';
import { usePomodoro } from '@/hooks/usePomodoro';
import { useTraveler } from '@/hooks/useTraveler';
import { useUserSettings } from '@/hooks/useUserSettings';
import { getOpenTaskTimerSnapshot, useTasks } from '@/hooks/useTasks';
import type { PomodoroBoostMultiplier, PomodoroPhase } from '@/lib/pomodoro-types';
import type { TravelerPhase } from '@/lib/traveler-types';
import {
  clearLocalTaskTracking,
  deriveLocalPresence,
  deriveRemoteTracking,
  deriveTakeoverForSelf,
  getDeviceLabel,
  MAX_TAKEOVER_PHASE_DURATION_MS,
  setPresenceUserId,
  useLocalTaskTracking,
  type RemoteTrackingSession,
  type TrackingPresencePayload,
} from '@/lib/tracking-presence';
import { confirmDialog } from '@/lib/confirm-modal';

/** Resolved once: the label is stable for the lifetime of the tab. */
const DEVICE_LABEL = getDeviceLabel();

/**
 * Coalesce a burst of awareness `change` events (cursor moves fire on every
 * pointer event) into a single trailing run. Without this each mousemove would
 * clone every client's state and rescan all payloads.
 */
function createCoalescer(
  run: () => void,
  delayMs = 100,
): { schedule: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule() {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        run();
      }, delayMs);
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

/**
 * Publish this device's running timer to the Yjs awareness channel.
 *
 * Mount once, high in the provider tree, so presence is announced regardless
 * of which board is open. Publishes nothing while idle or paused, and yields
 * its session when another client takes it over.
 */
export function useTrackingPresencePublisher(): void {
  const { userId } = useUserSettings();
  const pomodoro = usePomodoro();
  const traveler = useTraveler();
  const localTask = useLocalTaskTracking();
  // Let task-timer call sites that omit the user id attribute presence anyway.
  useEffect(() => {
    setPresenceUserId(userId);
  }, [userId]);
  // Subscribe for re-renders when a task timer changes — including a stop
  // triggered by another client, which must retract local presence.
  const { isFiltered } = useTasks();

  // The locally-attributed timer is gone (stopped here or elsewhere, or the
  // task was deleted), so stop claiming it. A filtered task list is not a
  // complete view, so absence there proves nothing; remote Yjs updates are
  // also skipped while filtered (see useTasks' observer).
  useEffect(() => {
    if (!isFiltered && localTask && !getOpenTaskTimerSnapshot(localTask.taskId)) {
      clearLocalTaskTracking();
    }
  });

  const payload = useMemo<TrackingPresencePayload | null>(
    () =>
      deriveLocalPresence({
        userId,
        pomodoro: {
          phase: pomodoro.state.phase,
          startedAt: pomodoro.state.startedAt,
          pausedAt: pomodoro.state.pausedAt,
          currentTaskId: pomodoro.currentTaskId,
          // `total` is the timer's own override-aware phase duration; reuse it
          // instead of re-deriving the boost rule here.
          durationMs: pomodoro.total,
          cycleCount: pomodoro.state.cycleCount,
          armedBoost: pomodoro.state.armedBoost,
          activeBoost: pomodoro.state.activeBoost,
        },
        traveler: {
          phase: traveler.state.phase,
          startedAt: traveler.state.startedAt,
          pausedAt: traveler.state.pausedAt,
          durationMs: traveler.total,
          breakDurationMs: traveler.state.breakDurationMs,
          departure: traveler.state.departure,
          destination: traveler.state.destination,
          travelMode: traveler.state.travelMode,
        },
        localTask,
        deviceLabel: DEVICE_LABEL,
      }),
    [
      userId,
      pomodoro.state.phase,
      pomodoro.state.startedAt,
      pomodoro.state.pausedAt,
      pomodoro.currentTaskId,
      pomodoro.state.activeBoost,
      pomodoro.state.armedBoost,
      pomodoro.state.cycleCount,
      pomodoro.total,
      traveler.state.phase,
      traveler.state.startedAt,
      traveler.state.pausedAt,
      traveler.total,
      traveler.state.breakDurationMs,
      traveler.state.departure,
      traveler.state.destination,
      traveler.state.travelMode,
      localTask,
    ],
  );

  useEffect(() => {
    if (!awareness) {
      if (import.meta.env.DEV) {
        console.debug('[presence] awareness unavailable — cross-device indicator disabled');
      }
      return;
    }
    awareness.setLocalStateField('tracking', payload);
    if (import.meta.env.DEV) console.debug('[presence] publish', payload);
  }, [payload]);

  // Another client asked to continue this session. Yielding is destructive (the
  // producer stops without recording) and awareness is unauthenticated, so a
  // request is only a prompt: the local user must confirm, and we re-check that
  // this is still the named session before stopping.
  const activeSessionId = payload?.sessionId;
  const activeTechnique = payload?.technique;
  const pomodoroReset = pomodoro.reset;
  const travelerReset = traveler.reset;
  useEffect(() => {
    if (!awareness || !activeSessionId) return;
    const prompted = new Set<string>();
    let inFlight = false;
    const run = () => {
      if (inFlight) return;
      const request = deriveTakeoverForSelf(
        awareness.getStates(),
        awareness.clientID,
        activeSessionId,
        userId,
      );
      if (!request) return;
      const key = `${request.sessionId}:${request.at}`;
      if (prompted.has(key)) return;
      prompted.add(key);
      inFlight = true;
      void confirmDialog({
        title: 'Continue on another device?',
        description:
          'Another device wants to continue this session. Stop this timer here without recording time?',
        confirmLabel: 'Hand over',
        cancelLabel: 'Keep running',
      })
        .then((confirmed) => {
          inFlight = false;
          if (!confirmed) return;
          // Only yield if this is still the session the request named.
          const local = awareness?.getLocalState?.() as
            | { tracking?: { sessionId?: string } }
            | null;
          if (local?.tracking?.sessionId !== request.sessionId) return;
          if (import.meta.env.DEV) console.debug('[presence] yielding to takeover', request);
          if (activeTechnique === 'pomodoro') pomodoroReset();
          else if (activeTechnique === 'traveler') travelerReset();
        })
        .catch(() => {
          inFlight = false;
        });
    };
    const coalesced = createCoalescer(run);
    awareness.on('change', coalesced.schedule);
    run();
    return () => {
      awareness.off('change', coalesced.schedule);
      coalesced.cancel();
    };
  }, [activeSessionId, activeTechnique, userId, pomodoroReset, travelerReset]);

  // Drop presence cleanly when the tab closes or the publisher unmounts.
  useEffect(() => {
    return () => {
      if (awareness) awareness.setLocalStateField('tracking', null);
      setPresenceUserId(null);
    };
  }, []);
}

/**
 * Continue the remote session on this device instead of starting a fresh one.
 *
 * Publishes a takeover request so the producer stops without recording, then
 * adopts the session with its original elapsed time. Returns a no-op for task
 * timers and sessions that already ended.
 */
export function useTakeOverTracking(): (session: RemoteTrackingSession) => void {
  const { userId } = useUserSettings();
  const pomodoro = usePomodoro();
  const traveler = useTraveler();
  const pomodoroAdopt = pomodoro.adoptSession;
  const travelerAdopt = traveler.adoptSession;

  return useCallback(
    (session: RemoteTrackingSession) => {
      const p = session.payload;
      if (!p.durationMs || p.durationMs <= 0) return;
      const now = Date.now();
      // A remote clock may be ahead of this one, and a forged payload must not
      // be able to fabricate unbounded tracked time: bound the start and the
      // claimed phase duration before adopting (and later recording) the
      // session. The bound admits multi-day traveler sessions; the nested
      // traveler/boost fields are range-checked by `isTrackingPayload`.
      if (p.sinceTs > now || p.durationMs > MAX_TAKEOVER_PHASE_DURATION_MS) return;
      const remaining = p.durationMs - (now - p.sinceTs);
      if (remaining <= 0) return;

      if (awareness) {
        awareness.setLocalStateField('takeover', {
          v: 1,
          targetClientId: session.clientId,
          sessionId: p.sessionId,
          // The producer only yields to a request from its own user.
          userId: userId ?? '',
          at: now,
        });
        // Requests are ephemeral; drop ours so a later session is not claimed.
        setTimeout(() => {
          if (awareness) awareness.setLocalStateField('takeover', null);
        }, 3000);
      }

      if (p.technique === 'pomodoro') {
        const activeBoost = (p.pomodoro?.activeBoost ?? 1) as PomodoroBoostMultiplier;
        // Keep the producer's start and duration: the remaining time is then
        // exact even if this device's config has not loaded or differs.
        pomodoroAdopt({
          phase: p.phase as PomodoroPhase,
          startedAt: p.sinceTs,
          cycleCount: p.pomodoro?.cycleCount ?? 0,
          armedBoost: (p.pomodoro?.armedBoost ?? 1) as PomodoroBoostMultiplier,
          activeBoost,
          taskId: p.taskId,
          durationOverrideMs: p.durationMs,
        });
        return;
      }

      if (p.technique === 'traveler' && p.traveler) {
        const t = p.traveler;
        travelerAdopt({
          phase: p.phase as TravelerPhase,
          startedAt: p.sinceTs,
          travelDurationMs: t.travelDurationMs,
          breakDurationMs: t.breakDurationMs,
          departure: t.departure,
          destination: t.destination,
          travelMode: t.travelMode,
        });
      }
    },
    [userId, pomodoroAdopt, travelerAdopt],
  );
}

/**
 * The live tracking session running on another device for the same user.
 *
 * Returns null when this device is the only tracker, when no session runs, or
 * when awareness is unavailable (browser-only mode). Cursor churn does not
 * re-render callers: the derived signature is compared before setting state.
 */
export function useRemoteTracking(): RemoteTrackingSession | null {
  const { userId } = useUserSettings();
  const [session, setSession] = useState<RemoteTrackingSession | null>(null);
  const signatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!awareness) {
      if (import.meta.env.DEV) {
        console.debug('[presence] reader: awareness unavailable — collaboration is off');
      }
      setSession(null);
      return;
    }

    const compute = () => {
      const next = deriveRemoteTracking(awareness.getStates(), awareness.clientID, userId);
      const signature = next
        ? [
            next.clientId,
            next.payload.sessionId,
            next.payload.userId,
            next.payload.taskId,
            next.payload.technique,
            next.payload.phase,
            next.payload.sinceTs,
            next.payload.deviceLabel,
          ].join('|')
        : null;
      if (signature === signatureRef.current) return;
      signatureRef.current = signature;
      if (import.meta.env.DEV) console.debug('[presence] remote', next?.payload ?? null);
      setSession(next);
    };

    compute();
    const coalesced = createCoalescer(compute);
    awareness.on('change', coalesced.schedule);
    return () => {
      awareness.off('change', coalesced.schedule);
      coalesced.cancel();
    };
  }, [userId]);

  return session;
}
