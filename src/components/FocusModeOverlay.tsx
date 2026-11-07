import React from 'react';
import { useFocusMode } from '@/hooks/useFocusMode';

interface FocusModeOverlayProps {
  children: React.ReactNode;
}

export const FocusModeOverlay: React.FC<FocusModeOverlayProps> = ({ children }) => {
  const { isFocusMode } = useFocusMode();

  // Keep the same host element in both modes. Swapping between a Fragment and
  // a <div> would remount the whole view subtree (data effects, subscriptions,
  // charts, tables) on every enter/exit, which is very expensive.
  return (
    <div
      className={isFocusMode ? 'fixed inset-0 z-40 bg-background overflow-auto' : undefined}
      style={isFocusMode ? undefined : { display: 'contents' }}
    >
      {children}
    </div>
  );
};
