import { useState, useCallback, useEffect, useRef } from 'react';

export const useVisibilityGuard = (enabled: boolean) => {
  const [showWarning, setShowWarning] = useState(false);
  const [wasHidden, setWasHidden] = useState(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const handleVisibilityChange = useCallback(() => {
    if (!enabledRef.current) return;

    if (document.hidden) {
      setWasHidden(true);
    } else if (wasHidden) {
      setShowWarning(true);
      setWasHidden(false);
    }
  }, [wasHidden]);

  const handleBeforeUnload = useCallback((e: BeforeUnloadEvent) => {
    if (!enabledRef.current) return;
    e.preventDefault();
    e.returnValue = '';
  }, []);

  const dismissWarning = useCallback(() => {
    setShowWarning(false);
    setWasHidden(false);
  }, []);

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleVisibilityChange]);

  useEffect(() => {
    if (enabled) {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled, handleBeforeUnload]);

  return {
    showWarning,
    dismissWarning,
  };
};