import { createContext } from 'react';

export interface FocusModeContextType {
  isFocusMode: boolean;
  enterFocusMode: () => void;
  exitFocusMode: () => void;
  toggleFocusMode: () => void;
}

export const FocusModeContext = createContext<FocusModeContextType | undefined>(undefined);
