export interface PomodoroConfig {
  workDuration: number;
  breakDuration: number;
  longBreakDuration: number;
  cyclesBeforeLongBreak: number;
  pomodoroEnabled: boolean;
}

export type PomodoroPhase = 'idle' | 'work' | 'short-break' | 'long-break';

export type PomodoroSessionKind = 'pomodoro' | 'traveler';

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
}

export interface PomodoroState {
  phase: PomodoroPhase;
  startedAt: number | null;
  cycleCount: number;
  pausedAt: number | null;
  pausedElapsed: number;
}

export interface FocusModeConfig {
  enablePiP: boolean;
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
  pomodoroEnabled: false,
};

export const DEFAULT_FOCUS_MODE_CONFIG: FocusModeConfig = {
  enablePiP: true,
  pipWidth: 120,
  pipHeight: 100,
  wakeLock: true,
  soundNotifications: true,
  showFocusOverlay: false,
  autoStartBreak: true,
  autoStartWork: false,
};