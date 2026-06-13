import { useContext } from 'react';
import { TravelerContextType } from '@/context/TravelerContextDefinition';
import { TravelerContext } from '@/context/TravelerContextDefinition';

export const useTraveler = (): TravelerContextType => {
  const ctx = useContext(TravelerContext);
  if (!ctx) {
    throw new Error('useTraveler must be used within a TravelerProvider');
  }
  return ctx;
};