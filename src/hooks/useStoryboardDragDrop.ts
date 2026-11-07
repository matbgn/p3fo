import React, { useCallback, useRef, useState } from 'react';
import { insertTaskAt, type StoryboardDropResolution } from '@/lib/storyboard-drop';

export interface StoryboardDropPreview extends StoryboardDropResolution {
  /** Horizontal offset of the insertion line inside the scroll container. */
  x: number;
}

interface UseStoryboardDragDropOptions<T extends { id: string }> {
  /** Visible cards in display order. */
  items: T[];
  /** Apply a reorder. Only called when the resulting order actually changes. */
  onReorder: (ordered: T[]) => void | Promise<void>;
  /** Optional clamp: where the card can actually land for the given pointer index. */
  resolveInsertion?: (rawIndex: number, baseItems: T[], draggedItem: T) => StoryboardDropResolution;
}

const identityInsertion = (rawIndex: number): StoryboardDropResolution => ({
  index: rawIndex,
  lockedGroup: null,
});

/**
 * Shared HTML5 drag-and-drop mechanics for the horizontal storyboards.
 *
 * Cards are rendered as columns marked with `data-storyboard-column` and
 * `data-task-id`; the hook measures those columns so gaps between cards drop
 * exactly where the insertion line is shown. Callers render the line with
 * `StoryboardDropIndicator`.
 */
export function useStoryboardDragDrop<T extends { id: string }>({
  items,
  onReorder,
  resolveInsertion,
}: UseStoryboardDragDropOptions<T>) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<StoryboardDropPreview | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const autoScrollDirectionRef = useRef(0);

  const stopAutoScroll = useCallback(() => {
    autoScrollDirectionRef.current = 0;
    if (autoScrollRafRef.current !== null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }, []);

  const clearDragState = useCallback(() => {
    setDraggedId(null);
    setDropPreview(null);
  }, []);

  const tickAutoScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || autoScrollDirectionRef.current === 0) {
      autoScrollRafRef.current = null;
      return;
    }
    const speed = 12;
    container.scrollLeft += autoScrollDirectionRef.current * speed;
    autoScrollRafRef.current = requestAnimationFrame(tickAutoScroll);
  }, []);

  // Translate a pointer position into the gap where the card would land.
  // The dragged card is ignored so the index is relative to the order the
  // board will have after the drop (which is what makes gaps behave).
  const resolveDropPreview = useCallback(
    (clientX: number, draggedCardId: string): StoryboardDropPreview | null => {
      const container = containerRef.current;
      const draggedItem = items.find(item => item.id === draggedCardId);
      if (!container || !draggedItem) return null;

      const allColumns = Array.from(
        container.querySelectorAll<HTMLElement>('[data-storyboard-column]'),
      );
      const columns = allColumns.filter(column => column.dataset.taskId !== draggedCardId);
      const baseItems = items.filter(item => item.id !== draggedCardId);
      if (columns.length !== baseItems.length) return null;

      let rawIndex = 0;
      for (const column of columns) {
        const rect = column.getBoundingClientRect();
        if (clientX > rect.left + rect.width / 2) rawIndex += 1;
      }

      const { index, lockedGroup } = (resolveInsertion ?? identityInsertion)(
        rawIndex,
        baseItems,
        draggedItem,
      );

      const containerRect = container.getBoundingClientRect();
      const gapHalf = 6;
      const draggedIndex = items.findIndex(item => item.id === draggedCardId);
      const draggedColumn = allColumns.find(column => column.dataset.taskId === draggedCardId);
      let x: number;
      if (draggedColumn && index === draggedIndex) {
        // The card lands back in its own slot (common for clamped drops), and
        // the source card is still rendered there. Anchor the line on the
        // source instead of on the next card, which sits to its right.
        const rect = draggedColumn.getBoundingClientRect();
        x = rect.left - containerRect.left + container.scrollLeft - gapHalf;
      } else if (index < columns.length) {
        const rect = columns[index].getBoundingClientRect();
        x = rect.left - containerRect.left + container.scrollLeft - gapHalf;
      } else if (columns.length > 0) {
        const rect = columns[columns.length - 1].getBoundingClientRect();
        x = rect.right - containerRect.left + container.scrollLeft + gapHalf;
      } else {
        x = container.scrollLeft + gapHalf;
      }

      return { index, x, lockedGroup };
    },
    [items, resolveInsertion],
  );

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, cardId: string) => {
    setDraggedId(cardId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cardId);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const EDGE = 60;
      const clientX = e.clientX;
      let direction = 0;
      if (clientX - rect.left < EDGE) direction = -1;
      else if (rect.right - clientX < EDGE) direction = 1;
      if (direction !== autoScrollDirectionRef.current) {
        autoScrollDirectionRef.current = direction;
        if (direction !== 0 && autoScrollRafRef.current === null) {
          autoScrollRafRef.current = requestAnimationFrame(tickAutoScroll);
        }
      }

      if (!draggedId) return;
      const preview = resolveDropPreview(clientX, draggedId);
      setDropPreview(previous => {
        if (!preview) return previous === null ? previous : null;
        if (
          previous &&
          previous.index === preview.index &&
          Math.abs(previous.x - preview.x) < 0.5 &&
          previous.lockedGroup === preview.lockedGroup
        ) {
          return previous;
        }
        return preview;
      });
    },
    [draggedId, resolveDropPreview, tickAutoScroll],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      stopAutoScroll();
      e.preventDefault();
      e.stopPropagation();

      const cardId = draggedId || e.dataTransfer.getData('text/plain');
      if (!cardId) {
        clearDragState();
        return;
      }

      const preview = resolveDropPreview(e.clientX, cardId) ?? dropPreview;
      const draggedItem = items.find(item => item.id === cardId);
      clearDragState();
      if (!preview || !draggedItem) return;

      const ordered = insertTaskAt(
        items.filter(item => item.id !== cardId),
        draggedItem,
        preview.index,
      );

      // Dropping where the card already sits (including a clamped attempt) is
      // a no-op: skip the write instead of renumbering every sibling.
      const unchanged = ordered.every((item, index) => item.id === items[index]?.id);
      if (unchanged) return;

      setReorderingId(cardId);
      try {
        await onReorder(ordered);
      } finally {
        setReorderingId(null);
      }
    },
    [clearDragState, draggedId, dropPreview, items, onReorder, resolveDropPreview, stopAutoScroll],
  );

  const handleDragEnd = useCallback(() => {
    stopAutoScroll();
    clearDragState();
  }, [clearDragState, stopAutoScroll]);

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (e.currentTarget === e.target) {
        stopAutoScroll();
        setDropPreview(null);
      }
    },
    [stopAutoScroll],
  );

  return {
    containerRef,
    draggedId,
    dropPreview,
    reorderingId,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
    handleDragLeave,
  };
}
