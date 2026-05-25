import React from 'react';
import { useFocusMode } from '@/hooks/useFocusMode';

interface FocusModeOverlayProps {
  children: React.ReactNode;
}

export const FocusModeOverlay: React.FC<FocusModeOverlayProps> = ({ children }) => {
  const { isFocusMode } = useFocusMode();

  if (!isFocusMode) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-40 bg-background overflow-auto">
      {children}
    </div>
  );
};
