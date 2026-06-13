import { useState, useCallback, useEffect } from 'react';
import { pipService } from '@/lib/pip-window';

export const useDocumentPiP = () => {
  const [isPiPActive, setIsPiPActive] = useState(pipService.isActive);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);

  const openPiP = useCallback(async (width?: number, height?: number) => {
    const win = await pipService.open(width, height);
    if (win) {
      setPipWindow(win);
      setIsPiPActive(true);
    }
    return win;
  }, []);

  const closePiP = useCallback(() => {
    pipService.close();
    setPipWindow(null);
    setIsPiPActive(false);
  }, []);

  useEffect(() => {
    const unsubOpen = pipService.onOpen((win) => {
      setPipWindow(win);
      setIsPiPActive(true);
    });

    const unsubClose = pipService.onClose(() => {
      setPipWindow(null);
      setIsPiPActive(false);
    });

    return () => {
      unsubOpen();
      unsubClose();
    };
  }, []);

  return {
    pipWindow,
    isPiPActive,
    isSupported: pipService.isSupported,
    openPiP,
    closePiP,
    container: pipService.getContainer,
  };
};