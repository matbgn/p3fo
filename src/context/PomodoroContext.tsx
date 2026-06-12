import React, { ReactNode } from 'react';
import { usePomodoroTimer } from '@/hooks/usePomodoroTimer';
import { PomodoroContext, PomodoroContextType } from './PomodoroContextDefinition';

export const PomodoroProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const timer = usePomodoroTimer();

  const value: PomodoroContextType = {
    ...timer,
    pomodoroEnabled: timer.config.pomodoroEnabled,
    focusConfig: timer.focusConfig,
  };

  return (
    <PomodoroContext.Provider value={value}>
      {children}
    </PomodoroContext.Provider>
  );
};