export interface PomodoroConfig {
  workDuration: number;
  breakDuration: number;
  longBreakDuration: number;
  cyclesBeforeLongBreak: number;
  pomodoroEnabled: boolean;
}

export type PomodoroPhase = 'idle' | 'work' | 'short-break' | 'long-break';

export type PomodoroSessionKind = 'pomodoro' | 'traveler';

/**
 * Multiplier applied to a boosted round: the work phase runs ×N, the
 * following break runs ×N, and metrics count the session as N pomodoros.
 * 1 = no boost.
 */
export type PomodoroBoostMultiplier = 1 | 2 | 3;

export interface PomodoroSession {
  id: string;
  taskId?: string;
  userId: string;
  startTime: number;
  endTime: number;
  phase: PomodoroPhase;
  duration: number;
  completed: boolean;
  kind?: PomodoroSessionKind;
  multiplier?: PomodoroBoostMultiplier;
}

export interface PomodoroState {
  phase: PomodoroPhase;
  startedAt: number | null;
  cycleCount: number;
  pausedAt: number | null;
  pausedElapsed: number;
  /** Boost armed for the next work round (applied at work start). */
  armedBoost: PomodoroBoostMultiplier;
  /** Boost of the phase currently running (0 = idle / not boosted). */
  activeBoost: PomodoroBoostMultiplier;
}

export interface FocusModeConfig {
  enablePiP: boolean;
  autoOpenPiPOnStart: boolean;
  pipWidth: number;
  pipHeight: number;
  wakeLock: boolean;
  soundNotifications: boolean;
  showFocusOverlay: boolean;
  autoStartBreak: boolean;
  autoStartWork: boolean;
}

export const DEFAULT_POMODORO_CONFIG: PomodoroConfig = {
  workDuration: 25 * 60 * 1000,
  breakDuration: 5 * 60 * 1000,
  longBreakDuration: 15 * 60 * 1000,
  cyclesBeforeLongBreak: 4,
  pomodoroEnabled: true,
};

export const INITIAL_POMODORO_STATE: PomodoroState = {
  phase: 'idle',
  startedAt: null,
  cycleCount: 0,
  pausedAt: null,
  pausedElapsed: 0,
  armedBoost: 1,
  activeBoost: 1,
};

export const DEFAULT_FOCUS_MODE_CONFIG: FocusModeConfig = {
  enablePiP: true,
  autoOpenPiPOnStart: true,
  pipWidth: 320,
  pipHeight: 400,
  wakeLock: true,
  soundNotifications: true,
  showFocusOverlay: false,
  autoStartBreak: false,
  autoStartWork: false,
};