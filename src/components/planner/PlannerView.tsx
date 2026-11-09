import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { addDaysToKey, addWeeks, combineDateKeyAndTime, parseDateKey, startOfDay, weekDateKeys } from '@/lib/planner/dates';
import { compareDayOrder } from '@/lib/planner/position';
import { edgeDropDate, type WeekDirection } from '@/lib/planner/drop';
import type { Task } from '@/hooks/useTasks';
import { useTasks } from '@/hooks/useTasks';
import { useAllTasks } from '@/hooks/useAllTasks';
import { useUsersContext } from '@/context/UsersContext';
import { useToday } from '@/hooks/useToday';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { WeekGrid } from './WeekGrid';
import { PlannerUnscheduledPanel } from './PlannerUnscheduledPanel';
import { PlannerHeader } from './PlannerHeader';
import { TaskEditorDialog } from './TaskEditorDialog';
import { RecurringStrip } from './RecurringStrip';
import { QuickAddTaskDialog, type QuickAddTaskInput } from './QuickAddTaskDialog';
import { TASK_COLORS, TASK_COLOR_STYLES } from '@/lib/planner/colors';
import { parseSmartTime } from '@/lib/planner/smart-time';
import type { TaskColor } from '@/lib/planner/types';
import { expandSeriesForRange, isOccurrence, isSeriesTemplate } from '@/lib/recurrence/engine';

type PlannerViewProps = {
  anchorDate: Date;
  onNavigate: (date: Date) => void;
  currentUserId?: string;
  hideHeader?: boolean;
  headerActions?: React.ReactNode;
};

type ContextState = {
  task: Task;
  x: number;
  y: number;
};

function collectTaskTree(rootId: string, tasks: Task[]): Task[] {
  const result: Task[] = [];
  const visit = (id: string) => {
    const task = tasks.find((candidate) => candidate.id === id);
    if (!task) return;
    result.push({ ...task });
    for (const childId of task.children ?? []) visit(childId);
  };
  visit(rootId);
  return result;
}


const EdgeZone: React.FC<{
  direction: WeekDirection;
  activeTask: Task | null;
  onHoverChange: (direction: WeekDirection | null) => void;
}> = ({ direction, activeTask, onHoverChange }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `edge:${direction}` });

  React.useEffect(() => {
    onHoverChange(isOver ? direction : null);
  }, [direction, isOver, onHoverChange]);

  if (!activeTask) return null;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'absolute inset-y-0 z-30 w-5 bg-primary/10 transition-colors',
        direction < 0 ? 'left-0' : 'right-0',
        isOver && 'bg-primary/25',
      )}
      aria-hidden
    />
  );
};

const UnscheduledDropZone: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setNodeRef, isOver } = useDroppable({ id: 'unscheduled', data: { type: 'unscheduled' } });

  return (
    <div ref={setNodeRef} className={cn('shrink-0', isOver && 'ring-2 ring-inset ring-primary/40')}>
      {children}
    </div>
  );
};

export const PlannerView: React.FC<PlannerViewProps> = ({
  anchorDate,
  onNavigate,
  currentUserId,
  hideHeader = false,
  headerActions,
}) => {
  const { t } = useTranslation();
  const { tasks: allTasks } = useAllTasks({ includeRecurring: true });
  const {
    createPlannedTask,
    movePlannedTask,
    updatePlannedDate,
    updateColor,
    clearPlannedDate,
    duplicatePlannedTask,
    bulkCarryOverPlannedTasks,
    restoreTaskSnapshots,
    toggleDone,
    deleteTask,
    materializeRecurringOccurrence,
    deleteRecurringOccurrence,
    stopRecurrence,
    setRecurrence,
  } = useTasks();
  const { users } = useUsersContext();
  const { toast } = useToast();
  const today = useToday();
  // The planner shows a rolling window: the anchor day plus the next six,
  // independent of the configured calendar week start.
  const windowStart = React.useMemo(() => startOfDay(anchorDate), [anchorDate]);
  const days = React.useMemo(() => weekDateKeys(windowStart), [windowStart]);

  const rawRootTasks = React.useMemo(() => {
    const seen = new Set<string>();

    return allTasks.filter((task) => {
      if (seen.has(task.id)) return false;
      seen.add(task.id);

      return (
        !task.parentId &&
        !task.deletedAt &&
        task.triageStatus !== 'Dropped' &&
        task.triageStatus !== 'Archived'
      );
    });
  }, [allTasks]);

  const seriesTemplates = React.useMemo(
    () => rawRootTasks.filter((task) => isSeriesTemplate(task)),
    [rawRootTasks],
  );

  const recurrenceExceptions = React.useMemo(
    () => allTasks.filter((task) => isOccurrence(task)),
    [allTasks],
  );

  const exceptionsBySeries = React.useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const exception of recurrenceExceptions) {
      if (!exception.seriesId) continue;
      const list = map.get(exception.seriesId);
      if (list) list.push(exception);
      else map.set(exception.seriesId, [exception]);
    }
    return map;
  }, [recurrenceExceptions]);

  const plainRootTasks = React.useMemo(
    () => rawRootTasks.filter((task) => !isSeriesTemplate(task)),
    [rawRootTasks],
  );

  const tasksByDay = React.useMemo(() => {
    const byIdByDay = new Map<string, Map<string, Task>>();
    for (const day of days) byIdByDay.set(day, new Map());

    for (const task of plainRootTasks) {
      if (task.plannedDate) byIdByDay.get(task.plannedDate)?.set(task.id, task);
    }

    const weekStart = days[0];
    const weekEnd = days[days.length - 1];
    if (weekStart && weekEnd) {
      for (const series of seriesTemplates) {
        // Expand once over the whole week instead of once per day; each
        // expansion scans the series' own exceptions.
        const occurrences = expandSeriesForRange(
          series,
          exceptionsBySeries.get(series.id) ?? [],
          weekStart,
          weekEnd,
        );

        for (const occurrence of occurrences) {
          if (occurrence.plannedDate) {
            byIdByDay.get(occurrence.plannedDate)?.set(occurrence.id, occurrence);
          }
        }
      }
    }

    const result: Record<string, Task[]> = {};
    for (const day of days) {
      result[day] = Array.from(byIdByDay.get(day)?.values() ?? []).sort(compareDayOrder);
    }

    return result;
  }, [days, exceptionsBySeries, plainRootTasks, seriesTemplates]);

  const unscheduled = React.useMemo(
    () => plainRootTasks
      .filter((task) => !task.plannedDate && task.triageStatus !== 'Done')
      .sort(compareDayOrder),
    [plainRootTasks],
  );

  const plannerTaskById = React.useMemo(() => {
    const map = new Map<string, Task>();
    for (const list of Object.values(tasksByDay)) {
      for (const task of list) map.set(task.id, task);
    }
    for (const task of unscheduled) map.set(task.id, task);
    return map;
  }, [tasksByDay, unscheduled]);
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
  const [context, setContext] = React.useState<ContextState | null>(null);
  const [activeTaskId, setActiveTaskId] = React.useState<string | null>(null);
  const [newTaskDate, setNewTaskDate] = React.useState<string | null>(null);
  const [edgeHover, setEdgeHover] = React.useState<WeekDirection | null>(null);
  const lastCarryOverRef = React.useRef<string | null>(null);

  const activeTask = activeTaskId ? plannerTaskById.get(activeTaskId) ?? allTasks.find((task) => task.id === activeTaskId) ?? null : null;
  const selectedTask = selectedTaskId ? allTasks.find((task) => task.id === selectedTaskId) ?? plannerTaskById.get(selectedTaskId) ?? null : null;

  const resolveTaskId = React.useCallback(async (task: Task): Promise<string | null> => {
    if (task.seriesId && task.occurrenceDate && !allTasks.some((candidate) => candidate.id === task.id)) {
      return materializeRecurringOccurrence(task.seriesId, task.occurrenceDate);
    }
    return task.id;
  }, [allTasks, materializeRecurringOccurrence]);

  // Generated occurrences have `${seriesId}:${date}` ids that do not exist in
  // the task store; resolve them to a real (materialized) task before mutating.
  const withResolvedId = React.useCallback(async (
    task: Task,
    action: (id: string) => void | Promise<unknown>,
  ) => {
    const id = await resolveTaskId(task);
    if (id) await action(id);
  }, [resolveTaskId]);

  const openTask = React.useCallback(async (task: Task) => {
    const id = await resolveTaskId(task);
    if (id) setSelectedTaskId(id);
  }, [resolveTaskId]);

  const toggleTaskDone = React.useCallback(async (task: Task) => {
    const id = await resolveTaskId(task);
    if (id) await toggleDone(id);
  }, [resolveTaskId, toggleDone]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  React.useEffect(() => {
    if (allTasks.length === 0) return;
    if (lastCarryOverRef.current === today) return;
    lastCarryOverRef.current = today;

    void bulkCarryOverPlannedTasks(today).then(({ count, snapshots }) => {
      if (count === 0) return;

      const undo = () => {
        void restoreTaskSnapshots(snapshots);
      };

      toast({
        title: t('planner.carryOverTitle', { count }),
        action: (
          <ToastAction altText="Undo carry-over" onClick={undo}>
            Undo
          </ToastAction>
        ),
      });
    });
  }, [allTasks.length, bulkCarryOverPlannedTasks, restoreTaskSnapshots, t, today, toast]);


  const showUndoToast = React.useCallback((title: string, undo: () => void) => {
    toast({
      title,
      action: (
        <ToastAction
          altText="Undo"
          onClick={undo}
        >
          Undo
        </ToastAction>
      ),
    });
  }, [toast]);

  const handleCreateQuickTask = React.useCallback(async (input: QuickAddTaskInput) => {
    const plannedDate = input.plannedDate ?? newTaskDate;
    if (!plannedDate) return;

    const parsed = parseSmartTime(input.title);
    const id = await createPlannedTask({
      title: parsed.text,
      plannedDate,
      plannedTime: input.plannedTime ?? parsed.time,
      color: input.color,
      dueDate: input.dueDate ? combineDateKeyAndTime(input.dueDate, input.dueTime) : null,
      dueTime: input.dueTime,
      durationInMinutes: input.durationInMinutes,
      userId: currentUserId,
    });
    if (id && input.recurrence) await setRecurrence(id, input.recurrence);
    setNewTaskDate(null);
  }, [createPlannedTask, currentUserId, newTaskDate, setRecurrence]);

  const handleDelete = React.useCallback(async (task: Task) => {
    if (isSeriesTemplate(task)) {
      await stopRecurrence(task.id);
      setSelectedTaskId(null);
      setContext(null);
      toast({ title: `Stopped repeating “${task.title}”` });
      return;
    }

    if (task.seriesId && task.occurrenceDate) {
      await deleteRecurringOccurrence(task.seriesId, task.occurrenceDate);
      setSelectedTaskId(null);
      setContext(null);
      toast({ title: `Deleted occurrence of “${task.title}”` });
      return;
    }

    const snapshots = collectTaskTree(task.id, allTasks);
    setSelectedTaskId(null);
    setContext(null);
    void deleteTask(task.id).then(() => {
      showUndoToast(t('planner.deleted', { title: task.title }), () => {
        void restoreTaskSnapshots(snapshots);
      });
    });
  }, [allTasks, deleteTask, deleteRecurringOccurrence, restoreTaskSnapshots, showUndoToast, stopRecurrence, t, toast]);

  const handleDuplicate = React.useCallback(async (task: Task) => {
    const id = await resolveTaskId(task);
    if (!id) return;
    setSelectedTaskId(null);
    setContext(null);
    void duplicatePlannedTask(id).then((newId) => {
      if (newId) toast({ title: t('planner.duplicated', { title: task.title }) });
    });
  }, [duplicatePlannedTask, resolveTaskId, t, toast]);

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    if (id.startsWith('task:')) setActiveTaskId(id.slice(5));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    setActiveTaskId(null);
    setEdgeHover(null);

    if (!activeId.startsWith('task:') || !overId) return;
    const taskId = activeId.slice(5);
    if (overId === activeId) return;
    const task = plannerTaskById.get(taskId) ?? allTasks.find((candidate) => candidate.id === taskId);
    if (!task) return;
    const resolvedTaskId = await resolveTaskId(task);
    if (!resolvedTaskId) return;

    if (overId === 'unscheduled') {
      void clearPlannedDate(resolvedTaskId);
      return;
    }

    if (overId.startsWith('edge:')) {
      const direction = Number(overId.slice(5)) as WeekDirection;
      const targetDate = edgeDropDate(task, windowStart, direction);
      await updatePlannedDate(resolvedTaskId, targetDate);
      onNavigate(addWeeks(windowStart, direction));
      return;
    }

    if (overId.startsWith('day:')) {
      const date = overId.slice(4);
      const dayTasks = tasksByDay[date] ?? [];
      void movePlannedTask(resolvedTaskId, {
        plannedDate: date,
        beforeId: null,
        displayOrder: dayTasks,
      });
      return;
    }

    if (overId.startsWith('task:')) {
      const overTaskId = overId.slice(5);
      const overTask = plannerTaskById.get(overTaskId) ?? allTasks.find((candidate) => candidate.id === overTaskId);
      if (!overTask?.plannedDate) return;

      const dayTasks = tasksByDay[overTask.plannedDate] ?? [];
      const index = dayTasks.findIndex((candidate) => candidate.id === overTaskId);
      if (index === -1) return;

      // dnd-kit's verticalListSortingStrategy previews an array move: dragging a
      // card downward opens the gap after the hovered card, upward before it.
      // Match that preview instead of always inserting before the over card.
      const activeIndex = dayTasks.findIndex(
        (candidate) => candidate.id === task.id || candidate.id === resolvedTaskId,
      );
      const draggingDown = activeIndex !== -1 && activeIndex < index;
      const beforeId = draggingDown ? dayTasks[index + 1]?.id ?? null : overTaskId;

      void movePlannedTask(resolvedTaskId, {
        plannedDate: overTask.plannedDate,
        beforeId,
        displayOrder: dayTasks,
      });
    }
  };

  const openMenu = (task: Task, event: React.MouseEvent | { clientX: number; clientY: number }) => {
    setContext({ task, x: event.clientX, y: event.clientY });
  };

  const closeContext = () => setContext(null);

  return (
    <div className="relative flex h-full min-h-[32rem] flex-col overflow-hidden rounded-lg border bg-card">
      {!hideHeader && (
        <PlannerHeader
          rangeStart={windowStart}
          onPrevious={() => onNavigate(addWeeks(windowStart, -1))}
          onNext={() => onNavigate(addWeeks(windowStart, 1))}
          onToday={() => onNavigate(parseDateKey(today))}
          actions={headerActions}
        />
      )}

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="relative flex-1 overflow-y-auto px-2">
          <WeekGrid
            days={days}
            tasksByDay={tasksByDay}
            today={today}
            users={users}
            onQuickAdd={(date) => setNewTaskDate(date)}
            onOpen={(task) => void openTask(task)}
            onToggleDone={(task) => void toggleTaskDone(task)}
            onContextMenu={openMenu}
            onDropTaskId={(taskId, date) => void updatePlannedDate(taskId, date)}
          />

          <EdgeZone direction={-1} activeTask={activeTask} onHoverChange={setEdgeHover} />
          <EdgeZone direction={1} activeTask={activeTask} onHoverChange={setEdgeHover} />
          {edgeHover !== null && (
            <div className="pointer-events-none absolute inset-y-0 z-20 flex w-full items-center justify-center">
              <span className="rounded-full bg-background/90 px-3 py-1 text-xs font-medium shadow">
                {edgeHover < 0 ? t('planner.previousWeek') : t('planner.nextWeek')}
              </span>
            </div>
          )}
        </div>

        <UnscheduledDropZone>
          <PlannerUnscheduledPanel
            tasks={allTasks}
            unscheduled={unscheduled}
            title={t('planner.unscheduledNoPlanDate')}
          />
        </UnscheduledDropZone>

        <RecurringStrip
          series={seriesTemplates}
          onOpen={(task) => void openTask(task)}
          onStop={(task) => {
            void stopRecurrence(task.id).then(() => toast({ title: `Stopped repeating “${task.title}”` }));
          }}
        />

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="max-w-56 truncate rounded-md border bg-card px-2 py-1 text-sm shadow-lg">
              {activeTask.plannedTime ? `${activeTask.plannedTime} ` : ''}
              {activeTask.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <TaskEditorDialog
        task={selectedTask}
        open={Boolean(selectedTask)}
        onOpenChange={(open) => {
          if (!open) setSelectedTaskId(null);
        }}
        defaultTab="card"
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
      />

      <QuickAddTaskDialog
        open={newTaskDate !== null}
        onOpenChange={(open) => {
          if (!open) setNewTaskDate(null);
        }}
        scheduledFor={newTaskDate}
        onCreate={handleCreateQuickTask}
      />

      {context && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeContext} onContextMenu={closeContext} />
          <div
            className="fixed z-50 min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            style={{ left: context.x, top: context.y }}
            role="menu"
          >
            <div className="flex flex-wrap gap-1 border-b px-1.5 py-1.5">
              {TASK_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={cn(
                    'h-5 w-5 rounded-full border',
                    TASK_COLOR_STYLES[color].swatch,
                    (context.task.color ?? 'none') === color && 'ring-2 ring-primary ring-offset-1',
                  )}
                  aria-label={TASK_COLOR_STYLES[color].label}
                  onClick={() => {
                    void withResolvedId(context.task, (id) => updateColor(id, color as TaskColor));
                    closeContext();
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              className="flex w-full items-center rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => {
                if (context.task.plannedDate) {
                  void withResolvedId(context.task, (id) =>
                    updatePlannedDate(id, addDaysToKey(context.task.plannedDate as string, 1)),
                  );
                }
                closeContext();
              }}
            >
              {t('planner.moveTomorrow')}
            </button>
            <button
              type="button"
              className="flex w-full items-center rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => {
                if (context.task.plannedDate) {
                  void withResolvedId(context.task, (id) =>
                    updatePlannedDate(id, addDaysToKey(context.task.plannedDate as string, 7)),
                  );
                }
                closeContext();
              }}
            >
              {t('planner.moveNextWeek')}
            </button>
            <button
              type="button"
              className="flex w-full items-center rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => {
                void withResolvedId(context.task, (id) => clearPlannedDate(id));
                closeContext();
              }}
            >
              {t('planner.moveUnscheduled')}
            </button>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              className="flex w-full items-center rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => handleDuplicate(context.task)}
            >
              {t('planner.duplicate')}
            </button>
            <button
              type="button"
              className="flex w-full items-center rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-accent"
              onClick={() => handleDelete(context.task)}
            >
              {t('planner.delete')}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
