import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TaskCard } from './TaskCard';
import { Task, Category, TriageStatus } from '@/hooks/useTasks';
import { cn } from '@/lib/utils';
import { useViewDisplay } from '@/hooks/useView';
import { COMPACTNESS_ULTRA, COMPACTNESS_COMPACT } from '@/context/ViewContextDefinition';
import { HOVER_ENTER_DELAY_MS } from '@/lib/hover-constants';
import { taskColorBar } from '@/lib/planner/colors';
import { AlertTriangle, CircleDot, Clock, Flame, Crosshair } from 'lucide-react';

interface StoryboardCardProps {
  task: Task;
  tasks: Task[];
  className?: string;
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
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onHoverHeightChange?: (height: number | null) => void;
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
  className,
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
  draggable,
  onDragStart,
  onHoverHeightChange,
}) => {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const hoverCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isHovered || !onHoverHeightChange) {
      onHoverHeightChange?.(null);
      return;
    }

    const element = hoverCardRef.current;
    if (!element) return;

    const report = () => onHoverHeightChange(element.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);

    return () => {
      observer.disconnect();
      onHoverHeightChange(null);
    };
  }, [isHovered, onHoverHeightChange]);

  const [isPinned, setIsPinned] = useState(false);
  const hoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = React.useRef(false);
  const suppressClickRef = React.useRef(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => {
    if (isDraggingRef.current) return;
    hoverTimerRef.current = setTimeout(() => {
      if (!isDraggingRef.current) {
        setIsHovered(true);
      }
    }, HOVER_ENTER_DELAY_MS);
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
    suppressClickRef.current = true;
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
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }, []);

  React.useEffect(() => {
    if (!isPinned) return;
    const handleClickOutside = (event: PointerEvent) => {
      if (wrapperRef.current?.contains(event.target as Node)) return;
      setIsPinned(false);
      setIsHovered(false);
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [isPinned]);

  const handleCompactClick = useCallback(() => {
    if (suppressClickRef.current || isDraggingRef.current) return;
    pinCard();
  }, [pinCard]);

  const { cardCompactness } = useViewDisplay();
  const difficultyColor = getDifficultyColor(task.difficulty);
  const colorBar = taskColorBar(task.color);
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
      ref={wrapperRef}
      className={cn('relative', className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      draggable={draggable}
      onDragStart={handleDragStartEvent}
      onDragEnd={handleDragEndEvent}
    >
      <div
        onClick={handleCompactClick}
        className={cn(
          'relative transition-all duration-200 rounded-md border shadow-sm bg-card text-card-foreground cursor-pointer select-none overflow-hidden',
          isDone && 'opacity-50',
          isHighlighted && 'ring-2 ring-yellow-400',
          isDragged && 'opacity-50',
        )}
        style={{ width: cardWidth, minHeight: cardMinHeight, fontSize }}
      >
        {colorBar && (
          <span
            className="absolute inset-y-0 left-0 w-1"
            style={{ backgroundColor: colorBar }}
            aria-hidden
          />
        )}
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
              <div className={cn('rounded-full shrink-0', difficultyColor)} style={{ width: dotPx, height: dotPx }} title={t('storyboard.difficultyTitle', { level: task.difficulty })} />
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
          ref={hoverCardRef}
          className="absolute top-0 left-0 z-50"
          style={{
            width: hoverWidth,
            opacity: isDragged ? 0.5 : 1,
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