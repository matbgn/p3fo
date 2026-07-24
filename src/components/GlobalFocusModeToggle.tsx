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

  return (
    <Button
      variant={isFocusMode ? "secondary" : "outline"}
      size="sm"
      onClick={isFocusMode ? handleExit : handleToggle}
      title={isFocusMode ? 'Exit Focus Mode (F11 or Esc)' : 'Enter Focus Mode (F11)'}
      className="h-7 w-7 sm:h-8 sm:w-8 sm:px-2 sm:w-auto p-0"
    >
      {isFocusMode ? (
        <Minimize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      ) : (
        <Maximize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      )}
      <span className="hidden sm:inline sm:ml-1.5 text-xs">Focus</span>
    </Button>
  );
};