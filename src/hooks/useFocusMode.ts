import { useContext } from 'react';
import { FocusModeContext } from '@/context/FocusModeContext';

export const useFocusMode = () => {
  const context = useContext(FocusModeContext);
  if (!context) {
    return {
      isFocusMode: false,
      enterFocusMode: () => {},
      exitFocusMode: () => {},
      toggleFocusMode: () => {},
    };
  }
  return context;
};
