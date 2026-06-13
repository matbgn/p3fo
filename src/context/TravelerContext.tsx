import React, { ReactNode } from 'react';
import { useTravelerTimer } from '@/hooks/useTravelerTimer';
import { TravelerContext, TravelerContextType } from './TravelerContextDefinition';

export const TravelerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const timer = useTravelerTimer();

  const value: TravelerContextType = {
    ...timer,
  };

  return (
    <TravelerContext.Provider value={value}>
      {children}
    </TravelerContext.Provider>
  );
};