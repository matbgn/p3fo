import React, { useRef, useEffect, useMemo } from 'react';
import { Calendar, momentLocalizer, View, SlotInfo } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ResizablePanel,
  ResizablePanelGroup,
  ResizableHandle,
} from '@/components/ui/resizable';
import { useTasks, Task } from '@/hooks/useTasks';
import { useAllTasks } from '@/hooks/useAllTasks';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useSettingsContext } from '@/context/SettingsContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QuickAddTask } from './QuickAddTask';
import { StoryboardCard } from './StoryboardCard';
import { AlertTriangle, CircleDot, Flame, GripHorizontal, ChevronDown, ChevronRight } from 'lucide-react';
import { FilterControls, Filters } from './FilterControls';
import { loadFiltersFromSessionStorage } from '@/lib/filter-storage';
import { getDefaultFilters, validateFilters, mergeViewFilters } from '@/lib/filter-merge';


interface ProgramViewProps {
  onFocusOnTask: (taskId: string) => void;
  onEditTask: (task: Task) => void;
}

const ProgramView: React.FC<ProgramViewProps> = ({ onFocusOnTask, onEditTask }) => {
  const calendarRef = useRef<Calendar>(null);

  const { settings } = useSettingsContext();
  const weekStartsOn = settings.weekStartDay;
  const defaultPlanView = settings.defaultPlanView || 'week';

  const [view, setView] = React.useState<View>(defaultPlanView);

  // Click-to-create task state
  const [newTaskDialogOpen, setNewTaskDialogOpen] = React.useState(false);
  const [newTaskTitle, setNewTaskTitle] = React.useState('');
  const [newTaskSlotDate, setNewTaskSlotDate] = React.useState<Date | null>(null);

  // Drag-over highlight state
  const [dragLineTop, setDragLineTop] = React.useState<number | null>(null);
  const [dragLineLeft, setDragLineLeft] = React.useState<number | null>(null);
  const justDroppedRef = React.useRef(false);

  // Clear highlight when drag ends (drop outside calendar or cancelled)
  React.useEffect(() => {
    const handleDragStartGlobal = () => {
      document.body.classList.add('rbc-dnd-active');
    };
    const handleDragEndGlobal = () => {
      setDragLineTop(null);
      setDragLineLeft(null);
      // Keep the class for a short delay to suppress any post-drop selection overlay
      setTimeout(() => {
        document.body.classList.remove('rbc-dnd-active');
      }, 300);
    };
    window.addEventListener('dragstart', handleDragStartGlobal);
    window.addEventListener('dragend', handleDragEndGlobal);
    return () => {
      window.removeEventListener('dragstart', handleDragStartGlobal);
      window.removeEventListener('dragend', handleDragEndGlobal);
    };
  }, []);

  useEffect(() => {
    if (defaultPlanView) {
      setView(defaultPlanView);
    }
  }, [defaultPlanView]);

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
    updateStatus, updateDifficulty, updateCategory, updateTitle,
    updateUser, deleteTask, duplicateTaskStructure,
    toggleUrgent, toggleImpact, toggleMajorIncident, toggleSprintTarget,
    toggleDone, toggleTimer, reparent,
    updateTerminationDate, updateComment, updateDurationInMinutes,
    createTask,
  } = useTasks();

  const { tasks } = useAllTasks();
  const { userId: currentUserId } = useUserSettings();

  const [storedFilters, setStoredFilters] = React.useState<Filters>(() => getDefaultFilters());
  const [isFiltersCollapsed, setIsFiltersCollapsed] = React.useState(true);

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

  const parentTasks = useMemo(() => {
    return tasks
      .filter(task => !task.parentId && task.triageStatus !== 'Done' && task.triageStatus !== 'Dropped' && task.triageStatus !== 'Archived')
      .filter(task => {
        if (displayFilters.searchText?.trim()) {
          const searchText = displayFilters.searchText.toLowerCase();
          if (!task.title.toLowerCase().includes(searchText)) {
            return false;
          }
        }

        if (displayFilters.showUrgent && !task.urgent) {
          return false;
        }

        if (displayFilters.showImpact && !task.impact) {
          return false;
        }

        if (displayFilters.showMajorIncident && !task.majorIncident) {
          return false;
        }

        if (displayFilters.showSprintTarget && !task.sprintTarget) {
          return false;
        }

        if (displayFilters.difficulty && Array.isArray(displayFilters.difficulty) && displayFilters.difficulty.length > 0 && !displayFilters.difficulty.includes(task.difficulty)) {
          return false;
        }

        if (displayFilters.category && Array.isArray(displayFilters.category) && displayFilters.category.length > 0 && task.category && !displayFilters.category.includes(task.category)) {
          return false;
        }

        if (displayFilters.status && Array.isArray(displayFilters.status) && displayFilters.status.length > 0 && !displayFilters.status.includes(task.triageStatus)) {
          return false;
        }

        if (displayFilters.selectedUserId) {
          if (displayFilters.selectedUserId === 'UNASSIGNED') {
            if (task.userId && task.userId !== 'unassigned') {
              return false;
            }
          } else {
            if (task.userId !== displayFilters.selectedUserId) {
              return false;
            }
          }
        }

        return true;
      });
  }, [tasks, displayFilters]);

  const tasksWithoutTerminationDate = useMemo(() => {
    return parentTasks.filter(task => !task.terminationDate);
  }, [parentTasks]);

  type CalendarEvent = {
    title: string;
    start: Date;
    end: Date;
    allDay: boolean;
    resource: Task;
  };

  const events = useMemo(() => {
    return parentTasks
      .filter(task => task.terminationDate)
      .map(task => {
        const startDate = new Date(task.terminationDate!);
        const duration = task.durationInMinutes;
        const isAllDayEvent = startDate.getHours() === 0 && startDate.getMinutes() === 0 && startDate.getSeconds() === 0;

        if (duration) {
          const endDate = new Date(startDate.getTime() + duration * 60000);
          return { title: task.title, start: startDate, end: endDate, allDay: false, resource: task };
        }
        if (isAllDayEvent) {
          return { title: task.title, start: startDate, end: startDate, allDay: true, resource: task };
        }
        const endDate = new Date(startDate.getTime() + 120 * 60000);
        return { title: task.title, start: startDate, end: endDate, allDay: false, resource: task };
      });
  }, [parentTasks]);

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

  const resolveSlotUnderCursor = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    const slot = el.closest('[data-date]') as HTMLElement | null;
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
      top: rect.top - containerRect.top + container.scrollTop + rect.height / 2,
      left: rect.left - containerRect.left + container.scrollLeft + rect.width / 2,
      container,
    };
  };

  const handleCalendarDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).style.visibility = 'hidden';
    const result = resolveSlotUnderCursor(e.clientX, e.clientY);
    (e.target as HTMLElement).style.visibility = '';

    if (result) {
      setDragLineTop(result.top);
      setDragLineLeft(result.left);
    } else {
      setDragLineTop(null);
      setDragLineLeft(null);
    }
  };

  const handleCalendarDragLeave = () => {
    setDragLineTop(null);
    setDragLineLeft(null);
  };

  const handleCalendarDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragLineTop(null);
    setDragLineLeft(null);
    document.body.classList.remove('rbc-dnd-active');
    justDroppedRef.current = true;
    setTimeout(() => { justDroppedRef.current = false; }, 500);

    (e.target as HTMLElement).style.visibility = 'hidden';
    const result = resolveSlotUnderCursor(e.clientX, e.clientY);
    (e.target as HTMLElement).style.visibility = '';

    if (!result) return;

    // Priority 1: external card from "No Termination Date" panel
    const taskId = e.dataTransfer.getData('text/task-id');
    if (taskId) {
      updateTerminationDate(taskId, result.date.getTime());
      updateDurationInMinutes(taskId, DEFAULT_DURATION_MIN);
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
            updateTerminationDate(taskId, newDate);
            updateDurationInMinutes(taskId, newDurationMin);
          }
        } else {
          const newDurationMin = Math.round((newDate - start) / 60000);
          if (newDurationMin > 0) {
            updateDurationInMinutes(taskId, newDurationMin);
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
        updateTerminationDate(taskId, result.date.getTime());
        updateDurationInMinutes(taskId, duration);
      } catch {
        // ignore
      }
    }
  };

  const handleSelectSlot = (slotInfo: SlotInfo) => {
    if (justDroppedRef.current) return;
    setNewTaskSlotDate(slotInfo.start);
    setNewTaskTitle('');
    setNewTaskDialogOpen(true);
  };

  const handleCreateTask = async () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    const id = await createTask(title, null, currentUserId);
    if (newTaskSlotDate && id) {
      updateTerminationDate(id, newTaskSlotDate.getTime());
      updateDurationInMinutes(id, DEFAULT_DURATION_MIN);
    }
    setNewTaskDialogOpen(false);
    setNewTaskTitle('');
    setNewTaskSlotDate(null);
  };

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

  return (
    <ResizablePanelGroup direction="vertical" className="min-h-[850px]">
      <ResizablePanel>
        <Card className="h-full min-h-0 flex flex-col">
          <CardHeader>
            <CardTitle>Program Calendar</CardTitle>
          </CardHeader>
          <CardContent
            className="h-full overflow-y-auto flex-grow relative"
            onDragOver={handleCalendarDragOver}
            onDragLeave={handleCalendarDragLeave}
            onDrop={handleCalendarDrop}
          >
            {/* Drag-over line indicator */}
            {dragLineTop !== null && (
              <div
                className="absolute left-0 right-0 z-50 pointer-events-none"
                style={{ top: dragLineTop }}
              >
                <div className="h-0.5 bg-primary" />
                {dragLineLeft !== null && (
                  <div
                    className="absolute -top-1.5 w-3 h-3 bg-primary rounded-full"
                    style={{ left: dragLineLeft }}
                  />
                )}
              </div>
            )}
            <Calendar
              key={weekStartsOn}
              ref={calendarRef}
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              style={{ height: '100%' }}
              view={view as View}
              onView={v => setView(v)}
              views={['week', 'month']}
              selectable
              onSelectEvent={(event) => onEditTask(event.resource)}
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
              eventPropGetter={(event) => ({
                style: {
                  backgroundColor: event.resource.urgent ? '#dc2626' :
                    event.resource.impact ? '#ca8a04' :
                      event.resource.majorIncident ? '#991b1b' : '#3b82f6',
                  borderColor: 'transparent',
                  borderRadius: '4px',
                  color: 'white',
                  fontSize: '0.75rem',
                }
              })}
              components={{
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
                      title="Drag to change start time"
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
                      title="Drag to change end time"
                    >
                      <GripHorizontal className="w-4 h-2 text-white drop-shadow" />
                    </div>
                  </div>
                )
              }}
            />
          </CardContent>
        </Card>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={7} collapsible={true} collapsedSize={7} minSize={7}>
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center justify-left">
              <span>In Progress (No Termination Date)</span>
              <Badge variant="secondary" className="ml-2">
                {tasksWithoutTerminationDate.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex flex-row gap-2 overflow-x-auto">
              {tasksWithoutTerminationDate
                .sort((a, b) => {
                  if (a.priority !== undefined && b.priority !== undefined) {
                    return a.priority - b.priority;
                  } else if (a.priority !== undefined) {
                    return -1;
                  } else if (b.priority !== undefined) {
                    return 1;
                  }
                  return a.createdAt - b.createdAt;
                })
                .map(task => (
                  <StoryboardCard
                    key={task.id}
                    task={task}
                    tasks={tasks}
                    updateStatus={updateStatus}
                    updateDifficulty={updateDifficulty}
                    updateCategory={updateCategory}
                    updateTitle={updateTitle}
                    updateUser={(id, userId) => updateUser(id, userId === 'current-user' ? currentUserId : userId)}
                    deleteTask={deleteTask}
                    duplicateTaskStructure={duplicateTaskStructure}
                    toggleUrgent={toggleUrgent}
                    toggleImpact={toggleImpact}
                    toggleMajorIncident={toggleMajorIncident}
                    toggleSprintTarget={toggleSprintTarget}
                    toggleDone={() => toggleDone(task.id)}
                    toggleTimer={toggleTimer}
                    reparent={reparent}
                    onFocusOnTask={onFocusOnTask}
                    updateTerminationDate={updateTerminationDate}
                    updateComment={updateComment}
                    updateDurationInMinutes={updateDurationInMinutes}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/task-id', task.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                  />
                ))}
            </div>
            <QuickAddTask
              placeholder="Quick add task..."
              userId={currentUserId}
              className="max-w-md"
            />
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-0 h-6 w-6"
                  onClick={() => setIsFiltersCollapsed(!isFiltersCollapsed)}
                >
                  {isFiltersCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
                <span className="text-sm font-medium text-muted-foreground cursor-pointer select-none" onClick={() => setIsFiltersCollapsed(!isFiltersCollapsed)}>
                  Filters & Controls
                </span>
              </div>
              {!isFiltersCollapsed && (
                <div className="flex flex-wrap items-center gap-4 border rounded-lg p-3">
                  <FilterControls
                    filters={storedFilters}
                    setFilters={setStoredFilters}
                    defaultFilters={getDefaultFilters()}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </ResizablePanel>

      {/* Click-to-create dialog */}
      <Dialog open={newTaskDialogOpen} onOpenChange={setNewTaskDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Task title..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateTask();
                if (e.key === 'Escape') setNewTaskDialogOpen(false);
              }}
              autoFocus
            />
            {newTaskSlotDate && (
              <p className="text-xs text-muted-foreground">
                Scheduled for: {newTaskSlotDate.toLocaleString()}
              </p>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="secondary" onClick={() => setNewTaskDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateTask} disabled={!newTaskTitle.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ResizablePanelGroup>
  );
};

export default ProgramView;
