import React, { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useFocusMode } from '@/hooks/useFocusMode';

interface GlobalFocusModeToggleProps {
  activeViewId: string;
}

export const GlobalFocusModeToggle: React.FC<GlobalFocusModeToggleProps> = ({ activeViewId }) => {
  const { isFocusMode } = useFocusMode();

  const handleToggle = useCallback(() => {
    window.dispatchEvent(new CustomEvent('togglefocusmode', { detail: { viewId: activeViewId } }));
  }, [activeViewId]);

  const handleExit = useCallback(() => {
    window.dispatchEvent(new CustomEvent('exitfocusmode', { detail: { viewId: activeViewId } }));
  }, [activeViewId]);

  // If not in focus mode, clicking enters it for the active view
  // If in focus mode, clicking exits it
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={isFocusMode ? handleExit : handleToggle}
      title={isFocusMode ? 'Exit Focus Mode (F11)' : 'Enter Focus Mode (F11)'}
    >
      {isFocusMode ? (
        <>
          <Minimize2 className="h-4 w-4 mr-2" />
          Focus
        </>
      ) : (
        <>
          <Maximize2 className="h-4 w-4 mr-2" />
          Focus
        </>
      )}
    </Button>
  );
};
