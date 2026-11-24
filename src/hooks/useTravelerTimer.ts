import { useState, useCallback, useRef, useEffect } from 'react';
import { AdoptedTravelerSession, TravelerConfig, TravelerPhase, TravelerState, INITIAL_TRAVELER_STATE, DEFAULT_TRAVELER_CONFIG } from '@/lib/traveler-types';
import { PomodoroSession, FocusModeConfig, DEFAULT_FOCUS_MODE_CONFIG } from '@/lib/pomodoro-types';
import { useSettingsContext } from '@/context/SettingsContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getPersistenceAdapter } from '@/lib/persistence-factory';
import { eventBus } from '@/lib/events';
import { computeBreakDuration } from '@/lib/traveler-api';
import { playChime } from '@/lib/audio-chime';
import { toast } from 'sonner';
import {
  clearActiveSession,
  resolveTravelerRestore,
  sessionRecordId,
  travelerPhaseDurationMs,
  type StoredTravelerSessionData,
} from '@/lib/active-session';
import { useActiveSessionPersistence } from '@/hooks/useActiveSessionPersistence';

const TRAVELER_STORAGE_KIND = 'traveler';

export const useTravelerTimer = () => {
  const { settings, loading: settingsLoading } = useSettingsContext();
  const { userId } = useCurrentUser();
  const config: TravelerConfig = settings.travelerConfig ?? DEFAULT_TRAVELER_CONFIG;
  const focusConfig: FocusModeConfig = settings.focusModeConfig ?? DEFAULT_FOCUS_MODE_CONFIG;

  const [state, setState] = useState<TravelerState>(INITIAL_TRAVELER_STATE);
  const [sessions, setSessions] = useState<PomodoroSession[]>([]);
  const [phaseTransition, setPhaseTransition] = useState<TravelerPhase | null>(null);
  const [, setTick] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef(state);
  const configRef = useRef(config);
  const focusConfigRef = useRef(focusConfig);

  stateRef.current = state;
  configRef.current = config;
  focusConfigRef.current = focusConfig;

  const onWorkCompleteRef = useRef<() => void>(() => {});
  const onBreakCompleteRef = useRef<() => void>(() => {});

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const getRemaining = useCallback((): number => {
    const s = stateRef.current;
    if (s.phase === 'idle' || !s.startedAt) return 0;

    const elapsed = s.pausedAt
      ? s.pausedElapsed
      : Date.now() - s.startedAt;
    const duration = travelerPhaseDurationMs(s);
    const remaining = duration - elapsed;
    return Math.max(0, remaining);
  }, []);

  const recordSession = useCallback(async (
    phase: 'work' | 'break',
    completed: boolean,
    startedAtOverride?: number,
    endTimeOverride?: number,
  ) => {
    const s = stateRef.current;
    const startedAt = startedAtOverride ?? s.startedAt;
    if (!startedAt) return;
    const endTime = endTimeOverride ?? Date.now();
    const recordedPhase: 'work' | 'short-break' = phase === 'work' ? 'work' : 'short-break';

    const session: PomodoroSession = {
      id: sessionRecordId('traveler', userId || 'anonymous', recordedPhase, startedAt),
      taskId: undefined,
      userId: userId || 'anonymous',
      startTime: startedAt,
      endTime,
      phase: recordedPhase,
      duration: endTime - startedAt,
      completed,
      kind: 'traveler',
    };

    try {
      const adapter = await getPersistenceAdapter();
      await adapter.createPomodoroSession(session);
      setSessions(prev => [...(Array.isArray(prev) ? prev : []), session]);
    } catch (error) {
      console.error('Error recording traveler session:', error);
    }

    eventBus.publish('travelerSessionCompleted', { session });
  }, [userId]);

  const notifyPhaseChange = useCallback((newPhase: TravelerPhase) => {
    eventBus.publish('travelerPhaseChanged', {
      phase: newPhase,
      departure: stateRef.current.departure,
      destination: stateRef.current.destination,
    });

    playChime(newPhase === 'work' ? 'work' : 'break');

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const label = newPhase === 'work' ? 'Flight time — focus!' : newPhase === 'break' ? 'Flight landed — take a break!' : "Break's over — ready for takeoff!";
      new Notification(label, { tag: 'traveler', requireInteraction: true });
    }
  }, []);

  const startTick = useCallback((onComplete: () => void) => {
    clearTimer();
    timerRef.current = setInterval(() => {
      setTick(t => t + 1);
      const remaining = getRemaining();
      if (remaining <= 0) {
        clearTimer();
        onComplete();
      }
    }, 250);
  }, [clearTimer, getRemaining]);

  const onWorkComplete = useCallback(() => {
    const s = stateRef.current;
    const breakDurationMs = computeBreakDuration(s.travelDurationMs);

    if (focusConfigRef.current.autoStartBreak) {
      const breakState: TravelerState = {
        ...s,
        phase: 'break',
        startedAt: Date.now(),
        pausedAt: null,
        pausedElapsed: 0,
        breakDurationMs,
      };
      setState(breakState);
      stateRef.current = breakState;
      notifyPhaseChange('break');
      startTick(() => onBreakCompleteRef.current());
    } else {
      setPhaseTransition('break');
      const breakState: TravelerState = {
        ...s,
        phase: 'break',
        startedAt: Date.now(),
        pausedAt: Date.now(),
        pausedElapsed: 0,
        breakDurationMs,
      };
      setState(breakState);
      stateRef.current = breakState;
      notifyPhaseChange('break');
    }

    recordSession('work', true);
  }, [notifyPhaseChange, startTick, recordSession]);

  const onBreakComplete = useCallback(() => {
    if (focusConfigRef.current.autoStartWork) {
      const s = stateRef.current;
      const workState: TravelerState = {
        ...s,
        phase: 'work',
        startedAt: Date.now(),
        pausedAt: null,
        pausedElapsed: 0,
      };
      setState(workState);
      stateRef.current = workState;
      notifyPhaseChange('work');
      startTick(() => onWorkCompleteRef.current());
    } else {
      setPhaseTransition('idle');

      const idleState: TravelerState = {
        ...INITIAL_TRAVELER_STATE,
        travelDurationMs: stateRef.current.travelDurationMs,
        breakDurationMs: stateRef.current.breakDurationMs,
        departure: stateRef.current.departure,
        destination: stateRef.current.destination,
        travelMode: stateRef.current.travelMode,
      };
      setState(idleState);
      stateRef.current = idleState;
      notifyPhaseChange('idle');
    }

    recordSession('break', true);
  }, [notifyPhaseChange, startTick, recordSession]);

  onWorkCompleteRef.current = onWorkComplete;
  onBreakCompleteRef.current = onBreakComplete;

  const startWork = useCallback((departure: string, destination: string, travelDurationMs: number, travelMode: 'flight' | 'train' = 'flight') => {
    const breakDurationMs = computeBreakDuration(travelDurationMs);

    setPhaseTransition(null);
    const workState: TravelerState = {
      phase: 'work',
      startedAt: Date.now(),
      pausedAt: null,
      pausedElapsed: 0,
      travelDurationMs,
      breakDurationMs,
      departure,
      destination,
      travelMode,
    };
    setState(workState);
    stateRef.current = workState;

    notifyPhaseChange('work');
    eventBus.publish('travelerStarted', {});
    startTick(() => onWorkCompleteRef.current());
  }, [notifyPhaseChange, startTick]);

  /**
   * Continue a traveler session started on another device. The caller has
   * already adjusted `startedAt` so the remaining time matches the remote.
   */
  const adoptSession = useCallback((session: AdoptedTravelerSession) => {
    if (session.phase === 'idle') return;
    setPhaseTransition(null);
    const adopted: TravelerState = {
      phase: session.phase,
      startedAt: session.startedAt,
      pausedAt: null,
      pausedElapsed: 0,
      travelDurationMs: session.travelDurationMs,
      breakDurationMs: session.breakDurationMs,
      departure: session.departure,
      destination: session.destination,
      travelMode: session.travelMode,
    };
    setState(adopted);
    stateRef.current = adopted;
    eventBus.publish('travelerStarted', {});
    const onComplete =
      session.phase === 'work' ? onWorkCompleteRef.current : onBreakCompleteRef.current;
    startTick(onComplete);
  }, [startTick]);

  const pause = useCallback(() => {
    setState(prev => {
      if (!prev.startedAt || prev.pausedAt) return prev;
      return {
        ...prev,
        pausedAt: Date.now(),
        pausedElapsed: prev.pausedElapsed + (Date.now() - prev.startedAt),
      };
    });
    clearTimer();
  }, [clearTimer]);

  const resume = useCallback(() => {
    const prev = stateRef.current;
    if (!prev.pausedAt) return;
    const elapsedSoFar = prev.pausedElapsed;
    const newStartedAt = Date.now() - elapsedSoFar;
    const resumedState: TravelerState = {
      ...prev,
      startedAt: newStartedAt,
      pausedAt: null,
      pausedElapsed: 0,
    };
    setState(resumedState);
    stateRef.current = resumedState;

    const onComplete = resumedState.phase === 'work' ? onWorkCompleteRef.current : onBreakCompleteRef.current;
    startTick(onComplete);
  }, [startTick]);

  const skip = useCallback(() => {
    clearTimer();
    const s = stateRef.current;

    if (s.phase === 'work') {
      const breakDurationMs = computeBreakDuration(s.travelDurationMs);

      if (focusConfigRef.current.autoStartBreak) {
        const breakState: TravelerState = {
          ...s,
          phase: 'break',
          startedAt: Date.now(),
          pausedAt: null,
          pausedElapsed: 0,
          breakDurationMs,
        };
        setState(breakState);
        stateRef.current = breakState;
        notifyPhaseChange('break');
        startTick(() => onBreakCompleteRef.current());
      } else {
        setPhaseTransition('break');
        const breakState: TravelerState = {
          ...s,
          phase: 'break',
          startedAt: Date.now(),
          pausedAt: Date.now(),
          pausedElapsed: 0,
          breakDurationMs,
        };
        setState(breakState);
        stateRef.current = breakState;
        notifyPhaseChange('break');
      }

      recordSession('work', false);
    } else if (s.phase === 'break') {
      if (focusConfigRef.current.autoStartWork) {
        const workState: TravelerState = {
          ...s,
          phase: 'work',
          startedAt: Date.now(),
          pausedAt: null,
          pausedElapsed: 0,
        };
        setState(workState);
        stateRef.current = workState;
        notifyPhaseChange('work');
        startTick(() => onWorkCompleteRef.current());
      } else {
        setPhaseTransition('idle');
        const idleState: TravelerState = {
          ...INITIAL_TRAVELER_STATE,
          travelDurationMs: s.travelDurationMs,
          breakDurationMs: s.breakDurationMs,
          departure: s.departure,
          destination: s.destination,
          travelMode: s.travelMode,
        };
        setState(idleState);
        stateRef.current = idleState;
        notifyPhaseChange('idle');
      }

      recordSession('break', false);
    }
  }, [clearTimer, notifyPhaseChange, startTick, recordSession]);

  const reset = useCallback(() => {
    clearTimer();
    if (userId) clearActiveSession(TRAVELER_STORAGE_KIND, userId);
    setState(INITIAL_TRAVELER_STATE);
    setPhaseTransition(null);
  }, [clearTimer, userId]);

  const dismissTransition = useCallback(() => {
    setPhaseTransition(null);
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  const loadSessions = useCallback(async (since?: number) => {
    try {
      const adapter = await getPersistenceAdapter();
      const uid = userId || undefined;
      const result = await adapter.listPomodoroSessions(uid, since);
      const arr = Array.isArray(result) ? result : [];
      setSessions(arr);
    } catch (error) {
      console.error('Error loading traveler sessions:', error);
      setSessions([]);
    }
  }, [userId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // ---- Persist and restore the running session across reload/crash ----
  useActiveSessionPersistence<StoredTravelerSessionData, TravelerState>({
    kind: TRAVELER_STORAGE_KIND,
    userId,
    ready: !settingsLoading,
    snapshot: () => {
      const s = stateRef.current;
      if (s.phase === 'idle' || !s.startedAt) return null;
      return { state: s };
    },
    persistToken: [
      state.phase,
      state.startedAt,
      state.pausedAt,
      state.pausedElapsed,
      state.travelDurationMs,
      state.breakDurationMs,
      state.departure,
      state.destination,
      state.travelMode,
    ].join('|'),
    isRunning: state.phase !== 'idle' && state.pausedAt === null,
    resolve: (stored, now) => resolveTravelerRestore(stored.data, stored.savedAt, now),
    onRestore: (restoredState) => {
      setState(restoredState);
      stateRef.current = restoredState;
      if (restoredState.pausedAt === null) {
        startTick(
          restoredState.phase === 'work'
            ? onWorkCompleteRef.current
            : onBreakCompleteRef.current,
        );
      }
      toast.info(
        restoredState.pausedAt === null
          ? 'Traveler session restored.'
          : 'Traveler session restored (paused).',
      );
    },
    onExpired: (stored, endTime, completed) => {
      const storedState = stored.data.state;
      void recordSession(
        storedState.phase === 'work' ? 'work' : 'break',
        completed,
        storedState.startedAt ?? undefined,
        endTime,
      );
      setState(INITIAL_TRAVELER_STATE);
      stateRef.current = INITIAL_TRAVELER_STATE;
      toast.info(
        completed
          ? 'A traveler session finished while you were away and was saved.'
          : 'A partial traveler session was saved while you were away.',
      );
    },
  });

  const remaining = getRemaining();
  const total = travelerPhaseDurationMs(state);
  const progress = total > 0 ? 1 - (remaining / total) : 0;

  return {
    state,
    config,
    sessions,
    remaining,
    total,
    progress,
    phaseTransition,
    startWork,
    adoptSession,
    pause,
    resume,
    skip,
    reset,
    dismissTransition,
    loadSessions,
    isRunning: state.phase !== 'idle' && state.pausedAt === null,
    isPaused: state.pausedAt !== null,
    travelerEnabled: config.enabled,
  };
};