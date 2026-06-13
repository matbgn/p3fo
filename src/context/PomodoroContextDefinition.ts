import { createContext } from 'react';
import { PomodoroConfig, PomodoroPhase, PomodoroSession, PomodoroState, FocusModeConfig } from '@/lib/pomodoro-types';

export interface PomodoroContextType {
  state: PomodoroState;
  config: PomodoroConfig;
  focusConfig: FocusModeConfig;
  currentTaskId: string | undefined;
  sessions: PomodoroSession[];
  remaining: number;
  total: number;
  progress: number;
  phaseTransition: PomodoroPhase | null;
  isRunning: boolean;
  isPaused: boolean;
  /**
   * 0-indexed slot of the current pomodoro session in the cycle.
   * - During work session N (1-indexed): displayCycleIndex = N - 1
   * - During break after session N: displayCycleIndex = N - 1
   * - During idle: -1
   */
  displayCycleIndex: number;
  startWork: (taskId?: string) => void;
  startBreak: (type?: 'short-break' | 'long-break') => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  reset: () => void;
  dismissTransition: () => void;
  loadSessions: (since?: number) => Promise<void>;
  pomodoroEnabled: boolean;
}

export const PomodoroContext = createContext<PomodoroContextType | undefined>(undefined);