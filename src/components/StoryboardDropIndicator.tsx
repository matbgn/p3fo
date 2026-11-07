import React from 'react';
import { cn } from '@/lib/utils';
import type { StoryboardDropPreview } from '@/hooks/useStoryboardDragDrop';

/**
 * Vertical insertion line shown while dragging a storyboard card.
 * Amber marks a clamped drop: the card cannot enter the hovered group and
 * will land at the group boundary instead.
 */
export const StoryboardDropIndicator: React.FC<{ preview: StoryboardDropPreview | null }> = ({
  preview,
}) => {
  if (!preview) return null;
  return (
    <div
      className="pointer-events-none absolute top-2 bottom-2 z-20 -translate-x-1/2"
      style={{ left: preview.x }}
      aria-hidden
    >
      <div
        className={cn(
          'h-full w-[3px] rounded-full shadow-md',
          preview.lockedGroup ? 'bg-amber-500' : 'bg-primary',
        )}
      />
    </div>
  );
};

export default StoryboardDropIndicator;
