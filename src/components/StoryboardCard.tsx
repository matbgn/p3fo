import React, { useState, useCallback } from 'react';
import { TaskCard } from './TaskCard';
import { Task, Category, TriageStatus } from '@/hooks/useTasks';
import { cn } from '@/lib/utils';
import { useViewDisplay } from '@/hooks/useView';
import { COMPACTNESS_ULTRA, COMPACTNESS_COMPACT } from '@/context/ViewContextDefinition';
import { AlertTriangle, CircleDot, Clock, Flame, Crosshair } from 'lucide-react';

interface StoryboardCardProps {
  task: Task;
  tasks: Task[];
  isHighlighted?: boolean;
  updateStatus: (id: string, status: TriageStatus) => void;
  updateDifficulty: (id: string, difficulty: 0.5 | 1 | 2 | 3 | 5 | 8) => void;
  updateCategory: (id: string, category: Category) => void;
  updateTitle: (id: string, title: string) => void;
  updateUser: (id: string, userId: string | undefined) => void;
  deleteTask: (id: string) => void;
  duplicateTaskStructure: (id: string) => void;
  toggleUrgent: (id: string) => void;
  toggleImpact: (id: string) => void;
  toggleMajorIncident: (id: string) => void;
  toggleSprintTarget: (id: string) => void;
  toggleDone: (id: string) => void;
  toggleTimer: (id: string, currentUserId?: string) => void;
  reparent: (id: string, parentId: string | null) => void;
  onFocusOnTask?: (taskId: string) => void;
  updateTerminationDate: (id: string, terminationDate: number | undefined) => void;
  updateComment: (id: string, comment: string) => void;
  updateDurationInMinutes: (id: string, durationInMinutes: number | undefined) => void;
  disableReparenting?: boolean;
  open?: boolean;
  onToggleOpen?: (id: string, toggleAll?: boolean) => void;
  isReordering?: boolean;
  isDragged?: boolean;
  isDragOver?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
}

function getDifficultyColor(difficulty: number | undefined): string {
  if (!difficulty) return 'bg-gray-400';
  if (difficulty <= 1) return 'bg-green-500';
  if (difficulty <= 3) return 'bg-yellow-500';
  if (difficulty <= 5) return 'bg-orange-500';
  return 'bg-red-500';
}

export const StoryboardCard: React.FC<StoryboardCardProps> = React.memo(({
  task,
  tasks,
  isHighlighted,
  updateStatus,
  updateDifficulty,
  updateCategory,
  updateTitle,
  updateUser,
  deleteTask,
  duplicateTaskStructure,
  toggleUrgent,
  toggleImpact,
  toggleMajorIncident,
  toggleSprintTarget,
  toggleDone,
  toggleTimer,
  reparent,
  onFocusOnTask,
  updateTerminationDate,
  updateComment,
  updateDurationInMinutes,
  disableReparenting,
  open,
  onToggleOpen,
  isReordering,
  isDragged,
  isDragOver,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const hoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = React.useRef(false);

  const handleMouseEnter = useCallback(() => {
    if (isDraggingRef.current) return;
    hoverTimerRef.current = setTimeout(() => {
      if (!isDraggingRef.current) {
        setIsHovered(true);
      }
    }, 1100);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (!isPinned) {
      setIsHovered(false);
    }
  }, [isPinned]);

  const pinCard = useCallback(() => {
    setIsPinned(true);
    setIsHovered(true);
  }, []);

  const unpinCard = useCallback(() => {
    setIsPinned(false);
    setIsHovered(false);
  }, []);

  const handleDragStartEvent = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    setIsHovered(false);
    setIsPinned(false);
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    onDragStart?.(e);
  }, [onDragStart]);

  const handleDragEndEvent = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  React.useEffect(() => {
    if (!isPinned) return;
    const handleClickOutside = () => {
      setIsPinned(false);
      setIsHovered(false);
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [isPinned]);

  const { cardCompactness } = useViewDisplay();
  const difficultyColor = getDifficultyColor(task.difficulty);
  const isDone = task.triageStatus === 'Done' || task.triageStatus === 'Dropped';

  const scale = cardCompactness === COMPACTNESS_ULTRA ? 1 : cardCompactness === COMPACTNESS_COMPACT ? 1.25 : 1.5;
  const fontSize = `${Math.round(10 * scale)}px`;
  const iconPx = Math.round(10 * scale);
  const dotPx = Math.round(6 * scale);
  const gapPx = Math.round(4 * scale);
  const padPx = Math.round(6 * scale);
  const cardWidth = `${7 * scale}rem`;
  const cardMinHeight = `${5 * scale}rem`;
  const hoverWidth = `${Math.round(320 * scale)}px`;

  const taskCardProps = {
    task,
    tasks,
    isHighlighted,
    updateStatus,
    updateDifficulty,
    updateCategory,
    updateTitle,
    updateUser,
    deleteTask,
    duplicateTaskStructure,
    toggleUrgent,
    toggleImpact,
    toggleMajorIncident,
    toggleSprintTarget,
    toggleDone: () => toggleDone(task.id),
    toggleTimer,
    reparent,
    onFocusOnTask,
    updateTerminationDate,
    updateComment,
    updateDurationInMinutes,
    disableReparenting,
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      draggable={draggable}
      onDragStart={handleDragStartEvent}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={handleDragEndEvent}
    >
      <div
        className={cn(
          'transition-all duration-200 rounded-md border shadow-sm bg-card text-card-foreground cursor-default select-none overflow-hidden',
          isDone && 'opacity-50',
          isHighlighted && 'ring-2 ring-yellow-400',
          isDragged && 'opacity-50',
        )}
        style={{ width: cardWidth, minHeight: cardMinHeight, fontSize }}
      >
        <div className="flex flex-col justify-between h-full" style={{ padding: padPx }}>
          <div
            className={cn(
              'font-medium leading-tight break-words',
              isDone && 'line-through text-muted-foreground',
            )}
          >
            {task.title}
          </div>
          <div className="flex items-center flex-wrap" style={{ gap: gapPx, marginTop: gapPx }}>
            {task.difficulty && (
              <div className={cn('rounded-full shrink-0', difficultyColor)} style={{ width: dotPx, height: dotPx }} title={`Difficulty: ${task.difficulty}`} />
            )}
            {task.urgent && (
              <AlertTriangle className="text-red-500 shrink-0" style={{ width: iconPx, height: iconPx }} />
            )}
            {task.impact && (
              <CircleDot className="text-yellow-500 shrink-0" style={{ width: iconPx, height: iconPx }} />
            )}
            {task.majorIncident && (
              <Flame className="text-red-700 shrink-0" style={{ width: iconPx, height: iconPx }} />
            )}
            {task.sprintTarget && (
              <Crosshair className="text-violet-500 shrink-0" style={{ width: iconPx, height: iconPx }} />
            )}
            {task.timer?.some((e: { endTime: number | null }) => !e.endTime) && (
              <Clock className="text-blue-500 shrink-0 animate-pulse" style={{ width: iconPx, height: iconPx }} />
            )}
          </div>
        </div>
      </div>

      {isHovered && (
        <div
          className="absolute top-0 left-0 z-50"
          style={{
            width: hoverWidth,
            opacity: isDragged ? 0.5 : 1,
            border: isDragOver ? '2px dashed #ccc' : 'none',
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            pinCard();
          }}
          onMouseEnter={() => {
            if (hoverTimerRef.current) {
              clearTimeout(hoverTimerRef.current);
              hoverTimerRef.current = null;
            }
          }}
          onMouseLeave={() => {
            if (!isPinned) {
              setIsHovered(false);
            }
          }}
        >
          <TaskCard
            {...taskCardProps}
            open={open}
            onToggleOpen={onToggleOpen}
          />
        </div>
      )}

      {isReordering && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-lg z-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
    </div>
  );
});