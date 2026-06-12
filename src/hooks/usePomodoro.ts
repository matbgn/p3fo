import { useContext } from 'react';
import { PomodoroContext, PomodoroContextType } from '@/context/PomodoroContextDefinition';

export const usePomodoro = (): PomodoroContextType => {
  const context = useContext(PomodoroContext);
  if (context === undefined) {
    throw new Error('usePomodoro must be used within a PomodoroProvider');
  }
  return context;
};