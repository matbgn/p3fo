import React, { useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, momentLocalizer, View, SlotInfo } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTasks, Task } from '@/hooks/useTasks';
import { useAllTasks } from '@/hooks/useAllTasks';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useSettingsContext } from '@/context/SettingsContext';
import { Button } from '@/components/ui/button';
import { PlannerView } from './planner/PlannerView';
import { PlannerUnscheduledPanel } from './planner/PlannerUnscheduledPanel';
import { CalendarNavHeader } from './planner/CalendarNavHeader';
import { MonthCalendarContext, MonthDayCell, MonthShowMore, type CalendarDisplayEvent } from './calendar/MonthDayCell';
import { QuickAddTaskDialog, type QuickAddTaskInput } from './planner/QuickAddTaskDialog';
import { TaskEditorDialog } from './planner/TaskEditorDialog';
import { FocusModeBar } from './planView/FocusModeBar';
import { useFocusMode } from '@/hooks/useFocusMode';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, CircleDot, Flame, GripHorizontal, Columns3, CalendarRange } from 'lucide-react';
import type { Filters } from './FilterControls';
import { loadFiltersFromSessionStorage } from '@/lib/filter-storage';
import { addDays, addDaysToKey, addWeeks, combineDateKeyAndTime, isoWeekNumber, parseDateKey, startOfDay, startOfWeek, toDateKey } from '@/lib/planner/dates';
import { parseSmartTime } from '@/lib/planner/smart-time';
import { isModuleEffectivelyDisabled } from '@/lib/persistence-types';
import { dueOffsetForSeries, expandSeriesForRange, isOccurrence, isSeriesTemplate } from '@/lib/recurrence/engine';
import { formatDateRangeTitle, formatMonthTitle, formatWeekNumber, formatWeekSpan } from '@/lib/planner/format';
import { getDefaultFilters, validateFilters, mergeViewFilters } from '@/lib/filter-merge';
import { taskColorBar } from '@/lib/planner/colors';
import { cn } from '@/lib/utils';


const MAX_RECURRENCE_PAD_DAYS = 366;

type DragTarget = {
  date: Date;
  top: number;
  left: number;
  width: number;
  height: number;
};

function resolveLayout(
  view: 'week' | 'month' | 'planner',
  plannerDisabled: boolean,
): 'week' | 'month' | 'planner' {
  if (view !== 'planner') return view;
  return plannerDisabled ? 'month' : 'planner';
}

function matchesDisplayFilters(task: Task, filters: Filters): boolean {
  if (filters.searchText?.trim()) {
    const searchText = filters.searchText.toLowerCase();
    if (!task.title.toLowerCase().includes(searchText)) {
      return false;
    }
  }

  if (filters.showUrgent && !task.urgent) return false;
  if (filters.showImpact && !task.impact) return false;
  if (filters.showMajorIncident && !task.majorIncident) return false;
  if (filters.showSprintTarget && !task.sprintTarget) return false;

  if (
    filters.difficulty &&
    filters.difficulty.length > 0 &&
    !filters.difficulty.includes(task.difficulty)
  ) {
    return false;
  }

  if (
    filters.category &&
    filters.category.length > 0 &&
    task.category &&
    !filters.category.includes(task.category)
  ) {
    return false;
  }

  if (
    filters.status &&
    filters.status.length > 0 &&
    !filters.status.includes(task.triageStatus)
  ) {
    return false;
  }

  if (filters.selectedUserId) {
    if (filters.selectedUserId === 'UNASSIGNED') {
      if (task.userId && task.userId !== 'unassigned') return false;
    } else if (task.userId !== filters.selectedUserId) {
      return false;
    }
  }

  return true;
}

type ProgramViewProps = {
  focusHeaderRightContent?: React.ReactNode;
};

const ProgramView: React.FC<ProgramViewProps> = ({ focusHeaderRightContent }) => {
  const { t } = useTranslation();
  const calendarRef = useRef<Calendar>(null);
  const { isFocusMode } = useFocusMode();

  const { settings } = useSettingsContext();
  const weekStartsOn = settings.weekStartDay;
  const defaultPlanView = settings.defaultPlanView || 'month';
  const plannerDisabled = isModuleEffectivelyDisabled(settings.disabledModules, 'program.planner');
  const initialLayout = resolveLayout(defaultPlanView, plannerDisabled);

  const [view, setView] = React.useState<View>(initialLayout === 'planner' ? 'week' : initialLayout);
  const [layout, setLayout] = React.useState<'week' | 'month' | 'planner'>(initialLayout);
  const [anchorDate, setAnchorDate] = React.useState(new Date());
  const [calendarMode, setCalendarMode] = React.useState<'due' | 'planned'>('due');

  // Click-to-create task state
  const [newTaskSlotDate, setNewTaskSlotDate] = React.useState<Date | null>(null);
  const [selectedPlannerTaskId, setSelectedPlannerTaskId] = React.useState<string | null>(null);

  // Drag-over highlight state
  const [dragTarget, setDragTarget] = React.useState<DragTarget | null>(null);
  const [isUnscheduleOver, setIsUnscheduleOver] = React.useState(false);
  const justDroppedRef = React.useRef(false);

  const clearRbcSlotSelection = React.useCallback(() => {
    document.querySelectorAll('.rbc-slot-selection').forEach((element) => element.remove());
  }, []);

  const scheduleSlotSelectionCleanup = React.useCallback(() => {
    [0, 50, 150, 300, 600, 1000].forEach((delay) => {
      window.setTimeout(clearRbcSlotSelection, delay);
    });
  }, [clearRbcSlotSelection]);

  // Clear highlight when drag ends (drop outside calendar or cancelled)
  React.useEffect(() => {
    const handleDragStartGlobal = () => {
      document.body.classList.add('rbc-dnd-active');
    };
    const handleDragEndGlobal = () => {
      setDragTarget(null);
      setIsUnscheduleOver(false);
      // Keep the class for a short delay to suppress any post-drop selection overlay
      setTimeout(() => {
        document.body.classList.remove('rbc-dnd-active');
        scheduleSlotSelectionCleanup();
      }, 300);
    };
    window.addEventListener('dragstart', handleDragStartGlobal);
    window.addEventListener('dragend', handleDragEndGlobal);
    return () => {
      window.removeEventListener('dragstart', handleDragStartGlobal);
      window.removeEventListener('dragend', handleDragEndGlobal);
    };
  }, [scheduleSlotSelectionCleanup]);

  useEffect(() => {
    if (defaultPlanView) {
      const nextLayout = resolveLayout(defaultPlanView, plannerDisabled);
      setLayout(nextLayout);
      setView(nextLayout === 'planner' ? 'week' : nextLayout);
    }
  }, [defaultPlanView, plannerDisabled]);

  useEffect(() => {
    moment.updateLocale('en', {
      week: {
        dow: weekStartsOn,
        doy: 4,
      }
    });
  }, [weekStartsOn]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const localizer = React.useMemo(() => momentLocalizer(moment), [weekStartsOn]);

  useEffect(() => {
    if (calendarRef.current) {
      const scrollToTime = new Date();
      scrollToTime.setHours(12, 0, 0);
    }
  }, [view]);

  const {
    deleteTask, duplicateTaskStructure,
    updateTerminationDate, updateDurationInMinutes,
    schedulePlannedTask, scheduleDueTask, clearPlannedDate, setRecurrence,
    stopRecurrence, deleteRecurringOccurrence,
    createPlannedTask, materializeRecurringOccurrence,
  } = useTasks();

  const { tasks } = useAllTasks({ includeRecurring: true });
  const { userId: currentUserId } = useUserSettings();

  const [storedFilters, setStoredFilters] = React.useState<Filters>(() => getDefaultFilters());

  const displayFilters = React.useMemo(() => {
    return mergeViewFilters(storedFilters, { defaultActiveStatuses: true });
  }, [storedFilters]);

  React.useEffect(() => {
    const load = async () => {
      try {
        const loaded = await loadFiltersFromSessionStorage();
        if (loaded) {
          const validated = validateFilters(loaded);
          setStoredFilters(validated);
        }
      } catch (error) {
        console.error("Error loading filters:", error);
      }
    };
    load();
  }, []);

  const baseParentTasks = useMemo(() => {
    if (layout === 'planner') return [];
    return tasks.filter(task =>
      !task.parentId &&
      !task.deletedAt &&
      !isSeriesTemplate(task) &&
      task.triageStatus !== 'Done' &&
      task.triageStatus !== 'Dropped' &&
      task.triageStatus !== 'Archived',
    );
  }, [layout, tasks]);

  const parentTasks = useMemo(() => {
    // The calendar is unmounted in the planner layout; skip its derivations on
    // every planner mutation.
    if (layout === 'planner') return [];
    return baseParentTasks.filter(task => matchesDisplayFilters(task, displayFilters));
  }, [baseParentTasks, displayFilters, layout]);

  const recurrenceExceptions = useMemo(
    () => layout === 'planner' ? [] : tasks.filter((task) => isOccurrence(task)),
    [layout, tasks],
  );

  const exceptionsBySeries = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const exception of recurrenceExceptions) {
      if (!exception.seriesId) continue;
      const list = map.get(exception.seriesId);
      if (list) list.push(exception);
      else map.set(exception.seriesId, [exception]);
    }
    return map;
  }, [recurrenceExceptions]);

  const seriesTemplates = useMemo(
    () => layout === 'planner' ? [] : tasks.filter((task) =>
      isSeriesTemplate(task) &&
      !task.deletedAt &&
      task.triageStatus !== 'Dropped' &&
      task.triageStatus !== 'Archived',
    ),
    [layout, tasks],
  );

  const recurrenceRange = useMemo(() => {
    if (view === 'month') {
      const firstOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
      const lastOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
      // Month cells render full weeks, including adjacent-month days, so expand
      // over the visible grid rather than only the calendar month.
      const visibleStart = startOfWeek(firstOfMonth, weekStartsOn as 0 | 1);
      const visibleEnd = addDays(startOfWeek(lastOfMonth, weekStartsOn as 0 | 1), 6);

      return { start: toDateKey(visibleStart), end: toDateKey(visibleEnd) };
    }

    const start = startOfWeek(anchorDate, weekStartsOn as 0 | 1);

    return { start: toDateKey(start), end: addDaysToKey(toDateKey(start), 6) };
  }, [anchorDate, view, weekStartsOn]);

  const tasksWithoutTerminationDate = useMemo(() => {
    // The shared unscheduled panel applies the full display filters itself
    // (including comment search), so pass it the unfiltered base list rather
    // than a title-only prefiltered one. It is not rendered in planner layout.
    if (layout === 'planner') return [];
    return baseParentTasks.filter(task => calendarMode === 'planned'
      ? !task.plannedDate
      : !(task.dueDate ?? task.terminationDate));
  }, [baseParentTasks, calendarMode, layout]);

  type CalendarEvent = CalendarDisplayEvent;

  const baseEvents = useMemo(() => {
    const baseById = new Map<string, CalendarEvent>();

    const addEvent = (task: Task, startDate: Date, allDay: boolean) => {
      const duration = task.durationInMinutes;
      if (allDay) {
        baseById.set(task.id, { title: task.title, start: startDate, end: startDate, allDay: true, resource: task });
        return;
      }
      const endDate = new Date(startDate.getTime() + (duration ?? 120) * 60000);
      baseById.set(task.id, { title: task.title, start: startDate, end: endDate, allDay: false, resource: task });
    };

    for (const task of parentTasks) {
      let startDate: Date;
      let allDay = false;

      if (calendarMode === 'planned') {
        if (!task.plannedDate) continue;
        startDate = parseDateKey(task.plannedDate);
        if (Number.isNaN(startDate.getTime())) continue;
        if (task.plannedTime) {
          const [hours, minutes] = task.plannedTime.split(':').map(Number);
          if (Number.isInteger(hours) && Number.isInteger(minutes)) {
            startDate.setHours(hours, minutes, 0, 0);
          } else {
            allDay = true;
          }
        } else {
          allDay = true;
        }
      } else {
        const due = task.dueDate ?? task.terminationDate;
        if (!due) continue;
        startDate = new Date(due);
        if (Number.isNaN(startDate.getTime())) continue;
        allDay = startDate.getHours() === 0 && startDate.getMinutes() === 0 && startDate.getSeconds() === 0;
      }

      addEvent(task, startDate, allDay);
    }

    return Array.from(baseById.values());
  }, [calendarMode, parentTasks]);

  // Recurrence expansion is intentionally independent of display filters so a
  // search keystroke does not re-expand every series over the calendar range.
  // The filter is applied to the already-expanded occurrences below.
  const expandedRecurringEvents = useMemo(() => {
    // The calendar is unmounted in the planner layout; do not expand recurring
    // series on every task mutation while the planner is shown.
    if (layout === 'planner') return [];

    const recurringById = new Map<string, CalendarEvent>();

    const addEvent = (task: Task, startDate: Date, allDay: boolean) => {
      const duration = task.durationInMinutes;
      if (allDay) {
        recurringById.set(task.id, { title: task.title, start: startDate, end: startDate, allDay: true, resource: task });
        return;
      }
      const endDate = new Date(startDate.getTime() + (duration ?? 120) * 60000);
      recurringById.set(task.id, { title: task.title, start: startDate, end: endDate, allDay: false, resource: task });
    };

    for (const series of seriesTemplates) {
      // In due mode an occurrence is displayed at occurrenceDate + due offset.
      // Shift the scan window by -offset so it covers exactly the occurrences
      // whose displayed due date falls inside the visible period instead of
      // materializing an extra band on both sides.
      const dueOffset = calendarMode === 'due' ? dueOffsetForSeries(series) : 0;
      // Clamp the shift so a distant (or imported, unvalidated) deadline cannot
      // expand the scan over years of calendar days.
      const shift = dueOffset === undefined
        ? 0
        : Math.max(-MAX_RECURRENCE_PAD_DAYS, Math.min(MAX_RECURRENCE_PAD_DAYS, -dueOffset));
      const seriesExceptions = exceptionsBySeries.get(series.id) ?? [];
      const occurrences = expandSeriesForRange(
        series,
        seriesExceptions,
        shift !== 0 ? addDaysToKey(recurrenceRange.start, shift) : recurrenceRange.start,
        shift !== 0 ? addDaysToKey(recurrenceRange.end, shift) : recurrenceRange.end,
      );

      const addDueEvent = (task: Task) => {
        if (!task.dueDate) return;
        const startDate = new Date(task.dueDate);
        if (Number.isNaN(startDate.getTime())) return;
        const dueKey = toDateKey(startDate);
        if (dueKey < recurrenceRange.start || dueKey > recurrenceRange.end) return;
        const allDay = startDate.getHours() === 0 && startDate.getMinutes() === 0 && startDate.getSeconds() === 0;
        addEvent(task, startDate, allDay);
      };

      for (const occurrence of occurrences) {
        if (calendarMode === 'planned') {
          if (!occurrence.plannedDate) continue;
          const startDate = parseDateKey(occurrence.plannedDate);
          if (Number.isNaN(startDate.getTime())) continue;
          if (occurrence.plannedTime) {
            const [hours, minutes] = occurrence.plannedTime.split(':').map(Number);
            if (Number.isInteger(hours) && Number.isInteger(minutes)) {
              startDate.setHours(hours, minutes, 0, 0);
              addEvent(occurrence, startDate, false);
            } else {
              addEvent(occurrence, startDate, true);
            }
          } else {
            addEvent(occurrence, startDate, true);
          }
        } else {
          addDueEvent(occurrence);
        }
      }

      if (calendarMode === 'due') {
        // Edited exceptions can carry a due date inside the visible range while
        // their planned date sits outside the series-offset scan window.
        for (const exception of seriesExceptions) {
          if (exception.deletedAt) continue;
          addDueEvent(exception);
        }
      }
    }

    return Array.from(recurringById.values());
  }, [calendarMode, exceptionsBySeries, layout, recurrenceRange, seriesTemplates]);

  const recurringEvents = useMemo(
    () => expandedRecurringEvents.filter((event) => matchesDisplayFilters(event.resource, displayFilters)),
    [expandedRecurringEvents, displayFilters],
  );

  const events = useMemo(() => {
    const eventById = new Map<string, CalendarEvent>();
    for (const event of baseEvents) eventById.set(event.resource.id, event);
    for (const event of recurringEvents) eventById.set(event.resource.id, event);
    return Array.from(eventById.values());
  }, [baseEvents, recurringEvents]);

  const eventsByDate = useMemo(() => {
    const byDate = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = toDateKey(event.start);
      const list = byDate.get(key);
      if (list) list.push(event);
      else byDate.set(key, [event]);
    }
    for (const list of byDate.values()) {
      list.sort((a, b) => a.start.getTime() - b.start.getTime());
    }
    return byDate;
  }, [events]);

  const DEFAULT_DURATION_MIN = 120;

  const calendarSlotPropGetter = React.useCallback(
    (date: Date) => ({
      'data-date': date.toISOString(),
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
      },
    }),
    []
  );

  const resolveSlotUnderCursor = (clientX: number, clientY: number): DragTarget | null => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;

    let slot = el.closest('[data-date]') as HTMLElement | null;

    if (!slot) {
      // Month and all-day rows render their event layer above the day
      // backgrounds, so map the pointer's x-position back to a day column.
      const row = el.closest('.rbc-month-row, .rbc-allday-cell');
      if (row) {
        slot = Array.from(row.querySelectorAll<HTMLElement>('.rbc-row-bg > [data-date]'))
          .find((cell) => {
            const cellRect = cell.getBoundingClientRect();
            return clientX >= cellRect.left && clientX <= cellRect.right;
          }) ?? null;
      }
    }

    if (!slot) return null;
    const dateStr = slot.getAttribute('data-date');
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const rect = slot.getBoundingClientRect();
    const container = slot.closest('.h-full.overflow-y-auto') as HTMLElement | null;
    if (!container) return null;
    const containerRect = container.getBoundingClientRect();
    return {
      date,
      top: rect.top - containerRect.top + container.scrollTop,
      left: rect.left - containerRect.left + container.scrollLeft,
      width: rect.width,
      height: rect.height,
    };
  };

  const handleCalendarDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    const target = e.target as HTMLElement;
    target.style.visibility = 'hidden';
    const result = resolveSlotUnderCursor(e.clientX, e.clientY);
    target.style.visibility = '';
    setDragTarget((current) => {
      if (current === result) return current;
      if (!current || !result) return result;
      if (
        current.date.getTime() === result.date.getTime() &&
        current.top === result.top &&
        current.left === result.left &&
        current.width === result.width &&
        current.height === result.height
      ) {
        return current;
      }
      return result;
    });
  };

  const handleCalendarDragLeave = () => {
    setDragTarget(null);
  };

  const ensureCalendarTaskId = async (taskId: string): Promise<string | null> => {
    if (tasks.some((task) => task.id === taskId)) return taskId;

    const [seriesId, occurrenceDate] = taskId.split(':');
    if (!seriesId || !occurrenceDate) return null;

    return materializeRecurringOccurrence(seriesId, occurrenceDate);
  };

  const updateCalendarDuration = async (taskId: string, duration: number) => {
    const resolvedTaskId = await ensureCalendarTaskId(taskId);
    if (resolvedTaskId) updateDurationInMinutes(resolvedTaskId, duration);
  };

  const assignCalendarSlot = async (taskId: string, date: Date, duration?: number) => {
    const resolvedTaskId = await ensureCalendarTaskId(taskId);
    if (!resolvedTaskId) return;

    if (calendarMode === 'planned') {
      const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
      // One write for date, time, position and duration instead of a separate
      // persistence round-trip per field.
      await schedulePlannedTask(resolvedTaskId, {
        plannedDate: toDateKey(date),
        plannedTime: hasTime
          ? `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
          : null,
        durationInMinutes: duration,
      });
    } else {
      await scheduleDueTask(resolvedTaskId, date.getTime(), duration);
    }
  };

  const handleCalendarDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragTarget(null);
    document.body.classList.remove('rbc-dnd-active');
    scheduleSlotSelectionCleanup();
    justDroppedRef.current = true;
    setTimeout(() => { justDroppedRef.current = false; }, 500);

    (e.target as HTMLElement).style.visibility = 'hidden';
    const result = resolveSlotUnderCursor(e.clientX, e.clientY);
    (e.target as HTMLElement).style.visibility = '';

    if (!result) return;

    // Priority 1: external card from "No Termination Date" panel
    const taskId = e.dataTransfer.getData('text/task-id');
    if (taskId) {
      void assignCalendarSlot(taskId, result.date, DEFAULT_DURATION_MIN);
      return;
    }

    // Priority 2: resize edge (top/bottom handles)
    const resizePayload = e.dataTransfer.getData('text/resize-event');
    if (resizePayload) {
      try {
        const { taskId, start, end, edge } = JSON.parse(resizePayload) as {
          taskId: string; start: number; end: number; edge: 'top' | 'bottom';
        };
        const newDate = result.date.getTime();
        if (edge === 'top') {
          const newDurationMin = Math.round((end - newDate) / 60000);
          if (newDurationMin > 0) {
            void assignCalendarSlot(taskId, new Date(newDate), newDurationMin);
          }
        } else {
          const newDurationMin = Math.round((newDate - start) / 60000);
          if (newDurationMin > 0) {
            void updateCalendarDuration(taskId, newDurationMin);
          }
        }
      } catch {
        // ignore
      }
      return;
    }

    // Priority 3: move existing event
    const movePayload = e.dataTransfer.getData('text/move-event');
    if (movePayload) {
      try {
        const { taskId, duration } = JSON.parse(movePayload) as {
          taskId: string; duration: number;
        };
        void assignCalendarSlot(taskId, result.date, duration);
      } catch {
        // ignore
      }
    }
  };

  const handleUnscheduleTask = async (taskId: string) => {
    const resolvedTaskId = await ensureCalendarTaskId(taskId);
    if (!resolvedTaskId) return;

    if (calendarMode === 'planned') {
      await clearPlannedDate(resolvedTaskId);
    } else {
      await updateTerminationDate(resolvedTaskId, undefined);
    }
  };

  const handleUnscheduleDrop = (e: React.DragEvent) => {
    setIsUnscheduleOver(false);
    const movePayload = e.dataTransfer.getData('text/move-event');
    if (!movePayload) return;

    e.preventDefault();
    document.body.classList.remove('rbc-dnd-active');
    scheduleSlotSelectionCleanup();
    try {
      const { taskId } = JSON.parse(movePayload) as { taskId: string };
      void handleUnscheduleTask(taskId);
    } catch {
      // ignore
    }
  };

  const handleSelectSlot = (slotInfo: SlotInfo) => {
    if (justDroppedRef.current) return;
    setNewTaskSlotDate(slotInfo.start);
  };

  const handleCreateTask = async (input: QuickAddTaskInput) => {
    const parsed = parseSmartTime(input.title);
    const slotDate = newTaskSlotDate;
    const plannedDate = input.plannedDate ?? (slotDate ? toDateKey(slotDate) : null);
    if (!plannedDate) return;

    const slotHasTime = Boolean(slotDate && (slotDate.getHours() !== 0 || slotDate.getMinutes() !== 0));
    const plannedTime = input.plannedTime
      ?? parsed.time
      ?? (slotDate && slotHasTime
        ? `${String(slotDate.getHours()).padStart(2, '0')}:${String(slotDate.getMinutes()).padStart(2, '0')}`
        : null);

    const dueDate = input.dueDate
      ? combineDateKeyAndTime(input.dueDate, input.dueTime)
      : calendarMode === 'due' && slotDate
        ? slotDate.getTime()
        : undefined;

    const id = await createPlannedTask({
      title: parsed.text,
      plannedDate,
      plannedTime,
      color: input.color,
      dueDate,
      durationInMinutes: input.durationInMinutes ?? DEFAULT_DURATION_MIN,
      userId: currentUserId,
    });
    if (id && input.recurrence) await setRecurrence(id, input.recurrence);
    setNewTaskSlotDate(null);
  };

  const selectedPlannerTask = selectedPlannerTaskId
    ? tasks.find((task) => task.id === selectedPlannerTaskId) ?? null
    : null;

  const handlePlannerDelete = React.useCallback(async (task: Task) => {
    setSelectedPlannerTaskId(null);
    if (isSeriesTemplate(task)) {
      await stopRecurrence(task.id);
      return;
    }
    if (task.seriesId && task.occurrenceDate) {
      await deleteRecurringOccurrence(task.seriesId, task.occurrenceDate);
      return;
    }
    await deleteTask(task.id);
  }, [deleteRecurringOccurrence, deleteTask, stopRecurrence]);

  const handlePlannerDuplicate = React.useCallback((task: Task) => {
    setSelectedPlannerTaskId(null);
    void duplicateTaskStructure(task.id);
  }, [duplicateTaskStructure]);

  const handleResizeStart = (e: React.DragEvent, event: CalendarEvent, edge: 'top' | 'bottom') => {
    e.stopPropagation();
    e.dataTransfer.setData('text/resize-event', JSON.stringify({
      taskId: event.resource.id,
      start: event.start.getTime(),
      end: event.end.getTime(),
      edge,
    }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleEventDragStart = (e: React.DragEvent, event: CalendarEvent) => {
    e.stopPropagation();
    const duration = Math.round((event.end.getTime() - event.start.getTime()) / 60000);
    e.dataTransfer.setData('text/move-event', JSON.stringify({
      taskId: event.resource.id,
      duration,
    }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleCalendarEventSelect = React.useCallback((event: CalendarEvent) => {
    const resource = event.resource;
    if (!tasks.some((task) => task.id === resource.id) && resource.seriesId && resource.occurrenceDate) {
      void materializeRecurringOccurrence(resource.seriesId, resource.occurrenceDate).then((id) => {
        if (id) setSelectedPlannerTaskId(id);
      });
      return;
    }
    setSelectedPlannerTaskId(resource.id);
  }, [materializeRecurringOccurrence, tasks]);

  const locale = typeof document !== 'undefined' ? document.documentElement.lang : undefined;
  const periodWeekStart = React.useMemo(
    () => startOfWeek(anchorDate, weekStartsOn as 0 | 1),
    [anchorDate, weekStartsOn],
  );
  const periodTitle = view === 'month'
    ? `${formatMonthTitle(anchorDate, locale, 'long')} ${anchorDate.getFullYear()}`
    : formatDateRangeTitle(periodWeekStart, locale);
  const periodSubtitle = view === 'month'
    ? undefined
    : formatWeekNumber(isoWeekNumber(addDays(periodWeekStart, 3)));

  const navigatePreviousPeriod = () => {
    setAnchorDate(view === 'month'
      ? new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 1, 1)
      : addWeeks(periodWeekStart, -1));
  };
  const navigateNextPeriod = () => {
    setAnchorDate(view === 'month'
      ? new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1)
      : addWeeks(periodWeekStart, 1));
  };
  const navigateTodayPeriod = () => setAnchorDate(new Date());

  const plannerWindowStart = React.useMemo(() => startOfDay(anchorDate), [anchorDate]);
  const focusPeriodTitle = layout === 'planner'
    ? formatDateRangeTitle(plannerWindowStart, locale)
    : periodTitle;
  const focusPeriodSubtitle = layout === 'planner'
    ? formatWeekSpan(plannerWindowStart)
    : periodSubtitle;
  const previousPeriodLabel = layout === 'month' ? t('planner.previousMonth') : t('planner.previousWeek');
  const nextPeriodLabel = layout === 'month' ? t('planner.nextMonth') : t('planner.nextWeek');
  const navigateFocusPrevious = layout === 'planner'
    ? () => setAnchorDate(addWeeks(plannerWindowStart, -1))
    : navigatePreviousPeriod;
  const navigateFocusNext = layout === 'planner'
    ? () => setAnchorDate(addWeeks(plannerWindowStart, 1))
    : navigateNextPeriod;

  const layoutControls = (
    <div className="flex items-center gap-1 rounded-md border bg-card p-1">
      {!plannerDisabled && (
        <Button
          variant={layout === 'planner' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => setLayout('planner')}
        >
          <Columns3 className="h-3.5 w-3.5" />
          {t('common.view.planner')}
        </Button>
      )}
      <Button
        variant={layout === 'week' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        onClick={() => {
          setLayout('week');
          setView('week');
        }}
      >
        <CalendarRange className="h-3.5 w-3.5" />
        {t('common.view.week')}
      </Button>
      <Button
        variant={layout === 'month' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        onClick={() => {
          setLayout('month');
          setView('month');
        }}
      >
        <CalendarRange className="h-3.5 w-3.5" />
        {t('common.view.month')}
      </Button>
    </div>
  );

  const modeControls = layout !== 'planner' ? (
    <div className="flex items-center gap-1 rounded-md border bg-card p-1">
      <Button
        variant={calendarMode === 'due' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => setCalendarMode('due')}
      >
        {t('program.dueDates')}
      </Button>
      <Button
        variant={calendarMode === 'planned' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => setCalendarMode('planned')}
      >
        {t('program.planned')}
      </Button>
    </div>
  ) : null;

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-2"
      onDragStartCapture={() => document.body.classList.add('rbc-dnd-active')}
    >
      {isFocusMode && (
        <FocusModeBar
          title={t('programTop.programCalendar')}
          leftContent={
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={navigateFocusPrevious}
                aria-label={previousPeriodLabel}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={navigateFocusNext}
                aria-label={nextPeriodLabel}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={navigateTodayPeriod}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                {t('planner.today')}
              </Button>
              <span className="ml-1 truncate text-sm font-semibold">{focusPeriodTitle}</span>
              {focusPeriodSubtitle && (
                <span className="shrink-0 text-[11px] text-muted-foreground">{focusPeriodSubtitle}</span>
              )}
              <div className="ml-1">{layoutControls}</div>
            </div>
          }
          rightContent={
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {modeControls}
              {focusHeaderRightContent}
            </div>
          }
        />
      )}

      {layout === 'planner' ? (
        <PlannerView
          anchorDate={anchorDate}
          onNavigate={setAnchorDate}
          currentUserId={currentUserId}
          hideHeader={isFocusMode}
          headerActions={layoutControls}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        <Card className="h-full min-h-0 flex flex-col">
          {!isFocusMode && (
            <CalendarNavHeader
              title={periodTitle}
              subtitle={periodSubtitle}
              period={view === 'month' ? 'month' : 'week'}
              onPrevious={navigatePreviousPeriod}
              onNext={navigateNextPeriod}
              onToday={navigateTodayPeriod}
              actions={
                <>
                  {layoutControls}
                  {modeControls}
                </>
              }
            />
          )}
          <CardContent
            className="h-full overflow-y-auto flex-grow relative"
            onDragOver={handleCalendarDragOver}
            onDragLeave={handleCalendarDragLeave}
            onDrop={handleCalendarDrop}
          >
            {/* Drag-over target indicator */}
            {dragTarget !== null && (
              view === 'month' ? (
                <div
                  className="absolute z-50 pointer-events-none rounded-sm bg-primary/15 ring-2 ring-inset ring-primary"
                  style={{
                    top: dragTarget.top,
                    left: dragTarget.left,
                    width: dragTarget.width,
                    height: dragTarget.height,
                  }}
                />
              ) : (
                <div
                  className="absolute left-0 right-0 z-50 pointer-events-none"
                  style={{ top: dragTarget.top + dragTarget.height / 2 }}
                >
                  <div className="h-0.5 bg-primary" />
                  <div
                    className="absolute -top-1.5 w-3 h-3 bg-primary rounded-full"
                    style={{ left: dragTarget.left + dragTarget.width / 2 }}
                  />
                </div>
              )
            )}
            <MonthCalendarContext.Provider value={{ view, eventsByDate, onSelectEvent: handleCalendarEventSelect }}>
            <Calendar
              key={weekStartsOn}
              ref={calendarRef}
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              style={{ height: '100%' }}
              view={view as View}
              onView={v => {
                setView(v);
                setLayout(v === 'month' ? 'month' : 'week');
              }}
              date={anchorDate}
              onNavigate={(date) => setAnchorDate(date)}
              views={['week', 'month']}
              toolbar={false}
              selectable="ignoreEvents"
              onSelectEvent={handleCalendarEventSelect}
              onSelectSlot={handleSelectSlot}
              defaultView="week"
              defaultDate={new Date()}
              scrollToTime={new Date(0, 0, 0, 4, 0, 0)}
              slotPropGetter={calendarSlotPropGetter}
              formats={{
                eventTimeRangeFormat: ({ start, end }, culture, local) => {
                  const startTime = local.format(start, 'HH:mm', culture);
                  if (moment(start).isSame(end)) {
                    return startTime;
                  }
                  const endTime = local.format(end, 'HH:mm', culture);
                  return `${startTime} - ${endTime}`;
                },
              }}
              eventPropGetter={(event) => {
                const colorBar = taskColorBar(event.resource.color);
               return {
                style: {
                  backgroundColor: event.resource.urgent ? '#dc2626' :
                    event.resource.impact ? '#ca8a04' :
                      event.resource.majorIncident ? '#991b1b' : '#3b82f6',
                  borderColor: 'transparent',
                  borderRadius: '4px',
                  color: 'white',
                  fontSize: '0.75rem',
                  ...(colorBar
                    ? { boxShadow: `inset 4px 0 0 0 ${colorBar}`, paddingLeft: '9px' }
                    : {}),
                }
                };
              }}
              components={{
                dateCellWrapper: MonthDayCell,
                showMore: MonthShowMore,
                event: ({ event }) => (
                  <div
                    className="relative w-full h-full group"
                    draggable
                    onDragStart={(e) => handleEventDragStart(e, event as unknown as CalendarEvent)}
                  >
                    {/* Top resize handle */}
                    <div
                      className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-2 cursor-row-resize opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        handleResizeStart(e, event as unknown as CalendarEvent, 'top');
                      }}
                      title={t('program.dragStartTime')}
                    >
                      <GripHorizontal className="w-4 h-2 text-white drop-shadow" />
                    </div>
                    <div className="p-1 text-xs">
                      <div className="font-semibold truncate">{event.title}</div>
                      <div className="flex gap-1 mt-1">
                        {event.resource.urgent && (
                          <AlertTriangle className="h-3 w-3 text-red-300" />
                        )}
                        {event.resource.impact && (
                          <CircleDot className="h-3 w-3 text-yellow-300" />
                        )}
                        {event.resource.majorIncident && (
                          <Flame className="h-3 w-3 text-red-200" />
                        )}
                      </div>
                    </div>
                    {/* Bottom resize handle */}
                    <div
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-2 cursor-row-resize opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        handleResizeStart(e, event as unknown as CalendarEvent, 'bottom');
                      }}
                      title={t('program.dragEndTime')}
                    >
                      <GripHorizontal className="w-4 h-2 text-white drop-shadow" />
                    </div>
                  </div>
                )
              }}
            />
            </MonthCalendarContext.Provider>
          </CardContent>
        </Card>
      </div>
      <div
        className={cn('shrink-0', isUnscheduleOver && 'ring-2 ring-inset ring-primary/40')}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('text/move-event')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setIsUnscheduleOver(true);
        }}
        onDragLeave={() => setIsUnscheduleOver(false)}
        onDrop={handleUnscheduleDrop}
      >
        <PlannerUnscheduledPanel
          tasks={tasks}
          unscheduled={tasksWithoutTerminationDate}
          title={t(calendarMode === 'planned' ? 'planner.unscheduledNoPlanDate' : 'planner.unscheduledNoDueDate')}
          filters={storedFilters}
          onFiltersChange={setStoredFilters}
        />
      </div>

      {/* Click-to-create dialog */}
      <QuickAddTaskDialog
        open={newTaskSlotDate !== null}
        onOpenChange={(open) => {
          if (!open) setNewTaskSlotDate(null);
        }}
        scheduledFor={newTaskSlotDate}
        onCreate={handleCreateTask}
      />

      <TaskEditorDialog
        task={selectedPlannerTask}
        open={Boolean(selectedPlannerTask)}
        onOpenChange={(open) => {
          if (!open) setSelectedPlannerTaskId(null);
        }}
        defaultTab="card"
        onDelete={handlePlannerDelete}
        onDuplicate={handlePlannerDuplicate}
      />
      </div>
      )}
    </div>
  );
};

export default ProgramView;
