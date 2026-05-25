import React, { useState, useCallback, useEffect } from 'react';
import { FocusModeContext } from '@/context/FocusModeContext';

const dispatchFocusModeChange = (active: boolean) => {
  document.body.dataset.focusMode = active ? 'true' : 'false';
  window.dispatchEvent(new CustomEvent('focusmodechange', { detail: { active } }));
};

interface FocusModeProviderProps {
  children: React.ReactNode;
  viewId: string;
}

export const FocusModeProvider: React.FC<FocusModeProviderProps> = ({ children, viewId }) => {
  const storageKey = `focusMode-${viewId}`;

  const [isFocusMode, setIsFocusMode] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, isFocusMode ? 'true' : 'false');
    } catch {
      // localStorage may be unavailable
    }
  }, [isFocusMode, storageKey]);

  // Sync body dataset on mount
  useEffect(() => {
    dispatchFocusModeChange(isFocusMode);
  }, [isFocusMode]);

  const enterFocusMode = useCallback(() => {
    setIsFocusMode(true);
    dispatchFocusModeChange(true);
  }, []);

  const exitFocusMode = useCallback(() => {
    setIsFocusMode(false);
    dispatchFocusModeChange(false);
  }, []);

  const toggleFocusMode = useCallback(() => {
    setIsFocusMode(prev => {
      const next = !prev;
      dispatchFocusModeChange(next);
      return next;
    });
  }, []);

  // Listen for global toggle/exit events targeted at this view
  useEffect(() => {
    const handleToggle = (e: CustomEvent<{ viewId: string }>) => {
      if (e.detail.viewId === viewId) {
        toggleFocusMode();
      }
    };
    const handleExit = (e: CustomEvent<{ viewId: string }>) => {
      if (e.detail.viewId === viewId) {
        exitFocusMode();
      }
    };
    window.addEventListener('togglefocusmode', handleToggle as EventListener);
    window.addEventListener('exitfocusmode', handleExit as EventListener);
    return () => {
      window.removeEventListener('togglefocusmode', handleToggle as EventListener);
      window.removeEventListener('exitfocusmode', handleExit as EventListener);
    };
  }, [viewId, toggleFocusMode, exitFocusMode]);

  return (
    <FocusModeContext.Provider value={{ isFocusMode, enterFocusMode, exitFocusMode, toggleFocusMode }}>
      {children}
    </FocusModeContext.Provider>
  );
};
