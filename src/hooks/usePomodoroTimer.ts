import { useState, useCallback, useRef, useEffect } from 'react';
import { PomodoroConfig, PomodoroPhase, PomodoroSession, PomodoroState, FocusModeConfig, DEFAULT_POMODORO_CONFIG, DEFAULT_FOCUS_MODE_CONFIG } from '@/lib/pomodoro-types';
import { useSettingsContext } from '@/context/SettingsContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getPersistenceAdapter } from '@/lib/persistence-factory';
import { eventBus } from '@/lib/events';
import { playChime } from '@/lib/audio-chime';

const INITIAL_STATE: PomodoroState = {
  phase: 'idle',
  startedAt: null,
  cycleCount: 0,
  pausedAt: null,
  pausedElapsed: 0,
};

export const usePomodoroTimer = () => {
  const { settings } = useSettingsContext();
  const { userId } = useCurrentUser();
  const config: PomodoroConfig = settings.pomodoroConfig ?? DEFAULT_POMODORO_CONFIG;
  const focusConfig: FocusModeConfig = settings.focusModeConfig ?? DEFAULT_FOCUS_MODE_CONFIG;

  const [state, setState] = useState<PomodoroState>(INITIAL_STATE);
  const [currentTaskId, setCurrentTaskId] = useState<string | undefined>(undefined);
  const [sessions, setSessions] = useState<PomodoroSession[]>([]);
  const [phaseTransition, setPhaseTransition] = useState<PomodoroPhase | null>(null);
  // Persists the last completed session slot so the progress dots
  // remain visible after the timer stops (e.g., during idle between
  // manual work starts). -1 means nothing has been completed yet.
  const [lastCompletedCycleIndex, setLastCompletedCycleIndex] = useState<number>(-1);
  const [, setTick] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef(state);
  const configRef = useRef(config);
  const focusConfigRef = useRef(focusConfig);
  const taskIdRef = useRef(currentTaskId);

  stateRef.current = state;
  configRef.current = config;
  focusConfigRef.current = focusConfig;
  taskIdRef.current = currentTaskId;

  const onWorkCompleteRef = useRef<() => void>(() => {});
  const onBreakCompleteRef = useRef<() => void>(() => {});

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const getPhaseDuration = useCallback((phase: PomodoroPhase): number => {
    const cfg = configRef.current;
    switch (phase) {
      case 'work': return cfg.workDuration;
      case 'short-break': return cfg.breakDuration;
      case 'long-break': return cfg.longBreakDuration;
      default: return 0;
    }
  }, []);

  const getRemaining = useCallback((): number => {
    const s = stateRef.current;
    if (s.phase === 'idle' || !s.startedAt) return 0;

    const elapsed = s.pausedAt
      ? s.pausedElapsed
      : Date.now() - s.startedAt;
    const duration = getPhaseDuration(s.phase);
    const remaining = duration - elapsed;
    return Math.max(0, remaining);
  }, [getPhaseDuration]);

  const recordSession = useCallback(async (phase: PomodoroPhase, taskId: string | undefined, completed: boolean, startedAtOverride?: number | null) => {
    const s = stateRef.current;
    const startedAt = startedAtOverride !== undefined ? startedAtOverride : s.startedAt;
    if (!startedAt) return;

    const session: PomodoroSession = {
      id: crypto.randomUUID(),
      taskId,
      userId: userId || 'anonymous',
      startTime: startedAt,
      endTime: Date.now(),
      phase,
      duration: Date.now() - startedAt,
      completed,
    };

    try {
      const adapter = await getPersistenceAdapter();
      await adapter.createPomodoroSession(session);
      setSessions(prev => [...(Array.isArray(prev) ? prev : []), session]);
    } catch (error) {
      console.error('Error recording pomodoro session:', error);
    }

    eventBus.publish('pomodoroSessionCompleted', { session });
  }, [userId]);

  const notifyPhaseChange = useCallback((newPhase: PomodoroPhase) => {
    eventBus.publish('pomodoroPhaseChanged', {
      phase: newPhase,
      taskId: taskIdRef.current,
      cycleCount: stateRef.current.cycleCount,
    });

    if (focusConfigRef.current.soundNotifications) {
      playChime(newPhase === 'work' ? 'work' : 'break');

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const body = taskIdRef.current ? `Task: ${taskIdRef.current}` : '';
        new Notification(
          newPhase === 'work' ? 'Work time!' : 'Break time!',
          { body, tag: 'pomodoro', requireInteraction: true }
        );
      }
    }
  }, []);

  const transitionTo = useCallback((newPhase: PomodoroPhase, taskId?: string) => {
    clearTimer();

    if (taskId !== undefined) {
      setCurrentTaskId(taskId);
    }

    if (newPhase === 'idle') {
      setState(INITIAL_STATE);
      return;
    }

    setState(prev => ({
      ...prev,
      phase: newPhase,
      startedAt: Date.now(),
      pausedAt: null,
      pausedElapsed: 0,
    }));

    notifyPhaseChange(newPhase);
  }, [clearTimer, notifyPhaseChange]);

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
    const cfg = configRef.current;
    const newCycleCount = s.cycleCount + 1;

    const nextBreak: PomodoroPhase = newCycleCount >= cfg.cyclesBeforeLongBreak ? 'long-break' : 'short-break';

    setLastCompletedCycleIndex(newCycleCount - 1);

    const sessionStartedAt = s.startedAt;

    if (focusConfigRef.current.autoStartBreak) {
      const breakState: PomodoroState = {
        phase: nextBreak,
        startedAt: Date.now(),
        cycleCount: newCycleCount,
        pausedAt: null,
        pausedElapsed: 0,
      };
      setState(breakState);
      stateRef.current = breakState;
      notifyPhaseChange(nextBreak);
      startTick(() => onBreakCompleteRef.current());
    } else {
      setPhaseTransition(nextBreak);
      const pausedBreakState: PomodoroState = {
        phase: nextBreak,
        startedAt: Date.now(),
        cycleCount: newCycleCount,
        pausedAt: Date.now(),
        pausedElapsed: 0,
      };
      setState(pausedBreakState);
      stateRef.current = pausedBreakState;
      notifyPhaseChange(nextBreak);
    }

    recordSession('work', taskIdRef.current, true, sessionStartedAt);
  }, [recordSession, notifyPhaseChange, startTick]);

  const onBreakComplete = useCallback(() => {
    const s = stateRef.current;
    const cfg = configRef.current;

    const justFinishedLongBreak = s.phase === 'long-break';
    const newCycleCount = justFinishedLongBreak ? 0 : s.cycleCount;
    const sessionPhase = s.phase;
    const sessionStartedAt = s.startedAt;

    if (focusConfigRef.current.autoStartWork) {
      const workState: PomodoroState = {
        phase: 'work',
        startedAt: Date.now(),
        cycleCount: newCycleCount,
        pausedAt: null,
        pausedElapsed: 0,
      };
      setState(workState);
      stateRef.current = workState;
      if (justFinishedLongBreak) {
        setLastCompletedCycleIndex(-1);
      }

      notifyPhaseChange('work');
      startTick(() => onWorkCompleteRef.current());
    } else {
      setPhaseTransition('work');
      const pausedWorkState: PomodoroState = {
        ...s,
        phase: 'work',
        startedAt: Date.now(),
        pausedAt: Date.now(),
        pausedElapsed: 0,
        cycleCount: newCycleCount,
      };
      setState(pausedWorkState);
      stateRef.current = pausedWorkState;
      if (justFinishedLongBreak) {
        setLastCompletedCycleIndex(-1);
      }

      notifyPhaseChange('work');
    }

    recordSession(sessionPhase, taskIdRef.current, true, sessionStartedAt);
  }, [startTick, notifyPhaseChange, recordSession]);

  onWorkCompleteRef.current = onWorkComplete;
  onBreakCompleteRef.current = onBreakComplete;

  const startWork = useCallback((taskId?: string) => {
    if (taskId !== undefined) {
      setCurrentTaskId(taskId);
    }

    setPhaseTransition(null);
    // Preserve cycleCount across work sessions so the user can manually
    // start each new work phase and still reach the long break after
    // cyclesBeforeLongBreak cycles. Only a full `reset()` clears it.
    const workState: PomodoroState = {
      phase: 'work',
      startedAt: Date.now(),
      cycleCount: stateRef.current.cycleCount,
      pausedAt: null,
      pausedElapsed: 0,
    };
    setState(workState);
    stateRef.current = workState;

    notifyPhaseChange('work');
    eventBus.publish('pomodoroStarted', {});
    startTick(() => onWorkCompleteRef.current());
  }, [startTick, notifyPhaseChange]);

  const startBreak = useCallback((type: 'short-break' | 'long-break' = 'short-break') => {
    setPhaseTransition(null);
    const breakState: PomodoroState = {
      ...stateRef.current,
      phase: type,
      startedAt: Date.now(),
      pausedAt: null,
      pausedElapsed: 0,
    };
    setState(breakState);
    stateRef.current = breakState;

    notifyPhaseChange(type);
    startTick(() => onBreakCompleteRef.current());
  }, [startTick, notifyPhaseChange]);

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
    const resumedState: PomodoroState = {
      ...prev,
      startedAt: newStartedAt,
      pausedAt: null,
      pausedElapsed: 0,
    };
    setState(resumedState);
    stateRef.current = resumedState;

    const currentPhase = resumedState.phase;
    const onComplete = currentPhase === 'work' ? onWorkCompleteRef.current : onBreakCompleteRef.current;
    startTick(onComplete);
  }, [startTick]);

  const skip = useCallback(() => {
    // Stop the active timer immediately to prevent a race condition
    // where the timer fires (e.g. onWorkComplete / onBreakComplete)
    // and calls notifyPhaseChange right after skip() also calls it,
    // resulting in a double chime.
    clearTimer();

    const s = stateRef.current;
    const sessionStartedAt = s.startedAt;
    if (s.phase === 'work') {
      const nextBreak: PomodoroPhase = s.cycleCount + 1 >= configRef.current.cyclesBeforeLongBreak ? 'long-break' : 'short-break';
      const newCycleCount = s.cycleCount + 1;
      setLastCompletedCycleIndex(newCycleCount - 1);

      if (focusConfigRef.current.autoStartBreak) {
        const breakState: PomodoroState = {
          ...s,
          phase: nextBreak,
          startedAt: Date.now(),
          pausedAt: null,
          pausedElapsed: 0,
          cycleCount: newCycleCount,
        };
        setState(breakState);
        stateRef.current = breakState;
        notifyPhaseChange(nextBreak);
        startTick(() => onBreakCompleteRef.current());
      } else {
        setPhaseTransition(nextBreak);
        const pausedBreakState: PomodoroState = {
          ...s,
          phase: nextBreak,
          startedAt: Date.now(),
          pausedAt: Date.now(),
          pausedElapsed: 0,
          cycleCount: newCycleCount,
        };
        setState(pausedBreakState);
        stateRef.current = pausedBreakState;
        notifyPhaseChange(nextBreak);
      }

      recordSession('work', taskIdRef.current, false, sessionStartedAt);
    } else if (s.phase === 'short-break' || s.phase === 'long-break') {
      const newCycleCount = s.phase === 'long-break' ? 0 : s.cycleCount;
      if (focusConfigRef.current.autoStartWork) {
        const workState: PomodoroState = {
          ...s,
          phase: 'work',
          startedAt: Date.now(),
          pausedAt: null,
          pausedElapsed: 0,
          cycleCount: newCycleCount,
        };
        setState(workState);
        stateRef.current = workState;
        if (s.phase === 'long-break') {
          setLastCompletedCycleIndex(-1);
        }
        notifyPhaseChange('work');
        startTick(() => onWorkCompleteRef.current());
      } else {
        setPhaseTransition('work');
        const pausedWorkState: PomodoroState = {
          ...s,
          phase: 'work',
          startedAt: Date.now(),
          pausedAt: Date.now(),
          pausedElapsed: 0,
          cycleCount: newCycleCount,
        };
        setState(pausedWorkState);
        stateRef.current = pausedWorkState;
        if (s.phase === 'long-break') {
          setLastCompletedCycleIndex(-1);
        }
        notifyPhaseChange('work');
      }
    }

    recordSession(s.phase, taskIdRef.current, false, sessionStartedAt);
  }, [recordSession, notifyPhaseChange, startTick, clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    setState(INITIAL_STATE);
    setCurrentTaskId(undefined);
    setPhaseTransition(null);
    setLastCompletedCycleIndex(-1);
  }, [clearTimer]);

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
      const arr = Array.isArray(result) ? result : Array.isArray((result as { data: PomodoroSession[] }).data) ? (result as { data: PomodoroSession[] }).data : [];
      setSessions(arr);
    } catch (error) {
      console.error('Error loading pomodoro sessions:', error);
      setSessions([]);
    }
  }, [userId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const remaining = getRemaining();
  const total = state.phase !== 'idle' ? getPhaseDuration(state.phase) : 0;
  const progress = total > 0 ? 1 - (remaining / total) : 0;

  // Compute the display cycle index: which 0-indexed session slot is
  // currently active. During work, it's the upcoming session (cycleCount).
  // During break, it's the session that just finished (cycleCount - 1).
  // When idle, fall back to the last completed session so the user can
  // still see their progress through the cycle.
  const displayCycleIndex =
    state.phase === 'work'
      ? state.cycleCount
      : state.phase === 'short-break' || state.phase === 'long-break'
        ? Math.max(0, state.cycleCount - 1)
        : lastCompletedCycleIndex;

  return {
    state,
    config,
    focusConfig,
    currentTaskId,
    sessions,
    remaining,
    total,
    progress,
    phaseTransition,
    displayCycleIndex,
    startWork,
    startBreak,
    pause,
    resume,
    skip,
    reset,
    dismissTransition,
    loadSessions,
    isRunning: state.phase !== 'idle' && state.pausedAt === null,
    isPaused: state.pausedAt !== null,
  };
};