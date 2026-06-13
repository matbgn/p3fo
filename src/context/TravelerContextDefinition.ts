import { createContext } from 'react';
import { TravelerConfig, TravelerPhase, TravelerState } from '@/lib/traveler-types';
import { PomodoroSession } from '@/lib/pomodoro-types';

export interface TravelerContextType {
  state: TravelerState;
  config: TravelerConfig;
  sessions: PomodoroSession[];
  remaining: number;
  total: number;
  progress: number;
  phaseTransition: TravelerPhase | null;
  isRunning: boolean;
  isPaused: boolean;
  startWork: (departure: string, destination: string, travelDurationMs: number, travelMode?: 'flight' | 'train') => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  reset: () => void;
  dismissTransition: () => void;
  loadSessions: (since?: number) => Promise<void>;
  travelerEnabled: boolean;
}

export const TravelerContext = createContext<TravelerContextType | undefined>(undefined);