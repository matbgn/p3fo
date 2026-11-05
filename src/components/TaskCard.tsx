import React from "react";
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GripVertical, Folder, AlertTriangle, CircleDot, Trash2, Clock2, Clock, Play, Pause, ChevronDown, ChevronRight, Flame, FileText, BellRing, CalendarIcon, User, Crosshair, Vote as VoteIcon } from "lucide-react";
import { TaskStatusSelect } from "./TaskStatusSelect";
import { useTasks, Task, Category, TriageStatus } from "@/hooks/useTasks";
import { Badge } from "@/components/ui/badge";
import { eventBus } from "@/lib/events";
import { LinkedVoteButton } from "@/components/voting/LinkedVoteButton";
import { CreateLinkedVoteDialog } from "@/components/voting/CreateLinkedVoteDialog";
import { createVote, loadVotes, useLinkedVotes } from "@/hooks/useVotes";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { TimeSheetDialog } from "./TimeSheetDialog";
import { Timer } from "@/features/timer/components/Timer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategorySelect } from "./CategorySelect";
import { Temporal } from '@js-temporal/polyfill';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/format-utils';
import { format } from "date-fns";
import { addReminder } from "@/utils/reminders";
import { useReminderStore } from "@/hooks/useReminders";
import { useShallow } from "zustand/react/shallow";
import { UserSelector } from "./UserSelector";
import { RichTextField } from "./RichTextField";
import { useUserSettings } from "@/hooks/useUserSettings";
import { Calendar } from "@/components/ui/calendar";
import { TimePickerDialog } from "@/components/ui/time-picker-dialog";
import { useSettingsContext } from "@/context/SettingsContext";
import { useViewDisplay } from "@/hooks/useView";
import { COMPACTNESS_ULTRA, COMPACTNESS_COMPACT, COMPACTNESS_FULL } from "@/context/ViewContextDefinition";
import { TaskEditModal } from "./TaskEditModal";
import { useCardAging } from "@/hooks/useCardAging";
import { AgingDecorations } from "@/components/AgingOverlays";
import { LiveTimeBadge, EditableTitle, DIFFICULTY_OPTIONS, getDifficultyColor, DifficultyBadge } from "./SharedTaskControls";
import { SubtaskProgress } from "./SubtaskProgress";

interface TaskCardProps {
  task: Task;
  tasks?: Task[];
  subtaskTasks?: Task[];
  tasksForModal?: Task[];
  onEditModalOpenChange?: (taskId: string, open: boolean) => void;
  columnIndex?: number;
  isSearchResult?: boolean;
  updateStatus: (id: string, status: TriageStatus) => void;
  updateDifficulty: (id: string, difficulty: 0.5 | 1 | 2 | 3 | 5 | 8) => void;
  updateCategory: (id: string, category: Category) => void;
  updateTitle: (id: string, title: string) => void;
  updateComment: (id: string, comment: string) => void;
  updateTerminationDate: (id: string, terminationDate: number | undefined) => void;
  updateDurationInMinutes: (id: string, durationInMinutes: number | undefined) => void;
  updateUser: (id: string, userId: string | undefined) => void;
  deleteTask: (id: string) => void;
  duplicateTaskStructure: (id: string) => void;
  toggleUrgent: (id: string) => void;
  toggleImpact: (id: string) => void;
  toggleMajorIncident: (id: string) => void;
  toggleSprintTarget: (id: string) => void;
  toggleDone: (task: Task) => void;
  toggleTimer: (id: string, currentUserId?: string) => void;
  reparent: (id: string, parentId: string | null) => void;
  onActivate?: (id: string, columnIndex?: number, isSearchResult?: boolean) => void;
  isActive?: boolean;
  isHighlighted?: boolean; // Added for search result highlighting
  isTriageBoard?: boolean;
  open?: boolean;
  onToggleOpen?: (id: string, toggleAll?: boolean) => void;
  onFocusOnTask?: (taskId: string) => void;
  disableReparenting?: boolean; // New prop to disable reparenting on drop
  hoverEnterDelayMs?: number; // Delay (ms) before hover controls appear on enter
}

const sameTaskList = (a?: Task[], b?: Task[]): boolean => {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const EMPTY_TASKS: Task[] = [];


function areTaskCardPropsEqual(prev: TaskCardProps, next: TaskCardProps): boolean {
  if (prev.task !== next.task) return false;
  if (prev.isActive !== next.isActive) return false;
  if (prev.isHighlighted !== next.isHighlighted) return false;
  if (prev.isTriageBoard !== next.isTriageBoard) return false;
  if (prev.open !== next.open) return false;
  if (prev.disableReparenting !== next.disableReparenting) return false;
  if (prev.hoverEnterDelayMs !== next.hoverEnterDelayMs) return false;
  if (prev.columnIndex !== next.columnIndex) return false;
  if (prev.isSearchResult !== next.isSearchResult) return false;
  if (!sameTaskList(prev.subtaskTasks, next.subtaskTasks)) return false;
  if (prev.tasksForModal !== next.tasksForModal) return false;
  if (prev.onEditModalOpenChange !== next.onEditModalOpenChange) return false;
  if (prev.subtaskTasks === undefined && next.subtaskTasks === undefined && !sameTaskList(prev.tasks, next.tasks)) return false;
  if (prev.tasksForModal === undefined && next.tasksForModal === undefined && !sameTaskList(prev.tasks, next.tasks)) return false;

  const functionKeys: (keyof TaskCardProps)[] = [
    'updateStatus',
    'updateDifficulty',
    'updateCategory',
    'updateTitle',
    'updateComment',
    'updateTerminationDate',
    'updateDurationInMinutes',
    'updateUser',
    'deleteTask',
    'duplicateTaskStructure',
    'toggleUrgent',
    'toggleImpact',
    'toggleMajorIncident',
    'toggleSprintTarget',
    'toggleDone',
    'toggleTimer',
    'reparent',
    'onActivate',
    'onToggleOpen',
    'onFocusOnTask',
  ];
  for (const key of functionKeys) {
    if (prev[key] !== next[key]) return false;
  }
  return true;
}

const TaskCardInner = React.forwardRef<HTMLDivElement, TaskCardProps>((
  {
    task,
    tasks,
    subtaskTasks,
    tasksForModal,
    onEditModalOpenChange,
    columnIndex,
    isSearchResult,
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
    onActivate,
    isActive,
    isHighlighted,
    isTriageBoard,
    open,
    onToggleOpen,
    onFocusOnTask,
    updateComment,
    updateTerminationDate,
    updateDurationInMinutes,
    disableReparenting,
    hoverEnterDelayMs,
  },
  ref
) => {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = React.useState(false);
  const hoverTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track open dropdowns so hover-gated controls stay mounted while a
  // portaled Select/Popover is open (prevents the card from collapsing
  // when the pointer moves into the portaled dropdown content).
  const [isAnyDropdownOpen, setIsAnyDropdownOpen] = React.useState(false);
  const openDropdownCountRef = React.useRef(0);
  // True while the pointer is physically over the card element.
  const pointerOverCardRef = React.useRef(false);

  const handleDropdownOpenChange = React.useCallback((open: boolean) => {
    if (open) {
      openDropdownCountRef.current += 1;
      setIsAnyDropdownOpen(true);
    } else {
      openDropdownCountRef.current = Math.max(0, openDropdownCountRef.current - 1);
      const stillOpen = openDropdownCountRef.current > 0;
      setIsAnyDropdownOpen(stillOpen);
      // When the last dropdown closes and the pointer is no longer over the
      // card, clear hover so the controls collapse again.
      if (!stillOpen && !pointerOverCardRef.current) {
        setIsHovered(false);
      }
    }
  }, []);

  const handleMouseEnter = React.useCallback(() => {
    pointerOverCardRef.current = true;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (hoverEnterDelayMs && hoverEnterDelayMs > 0) {
      hoverTimeoutRef.current = setTimeout(() => {
        hoverTimeoutRef.current = null;
        if (!pointerOverCardRef.current) return;
        setIsHovered(true);
      }, hoverEnterDelayMs);
    } else {
      setIsHovered(true);
    }
  }, [hoverEnterDelayMs]);

  const handleMouseLeave = React.useCallback(() => {
    pointerOverCardRef.current = false;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    hoverTimeoutRef.current = setTimeout(() => {
      hoverTimeoutRef.current = null;
      // Keep controls mounted while a dropdown is open so the user can
      // interact with portaled content without the card collapsing.
      if (openDropdownCountRef.current > 0) return;
      setIsHovered(false);
    }, 300);
  }, []);
  React.useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);
  const [isTimeSheetOpen, setIsTimeSheetOpen] = React.useState(false);
  const [isCommentModalOpen, setIsCommentModalOpen] = React.useState(false);
  const [commentText, setCommentText] = React.useState(task.comment || "");
  React.useEffect(() => {
    setCommentText(task.comment || "");
  }, [task.comment]);
  const [durationValue, setDurationValue] = React.useState(task.durationInMinutes || "");
  const [isDatePickerOpen, setIsDatePickerOpen] = React.useState(false);
  const [offsetMinutes, setOffsetMinutes] = React.useState(-1); // Default to -1 (No reminder)
  const [isDateTimeBlockOpen, setIsDateTimeBlockOpen] = React.useState(false); // New state for date/time block
  const [timePickerOpen, setTimePickerOpen] = React.useState(false); // State for time picker dialog
  const [reminderStatus, setReminderStatus] = React.useState<'none' | 'scheduled' | 'triggered'>('none'); // Update state to enum
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false); // New state for full edit modal
  React.useLayoutEffect(() => {
    onEditModalOpenChange?.(task.id, isEditModalOpen);
  }, [isEditModalOpen, task.id, onEditModalOpenChange]);
  const scheduledReminders = useReminderStore(
    useShallow(state => state.scheduledReminders.filter(r => r.taskId === task.id)),
  );
  const reminders = useReminderStore(
    useShallow(state => state.reminders.filter(r => r.taskId === task.id)),
  );
  const updateScheduledReminderTriggerDate = useReminderStore(state => state.updateScheduledReminderTriggerDate);
  const dismissReminder = useReminderStore(state => state.dismissReminder);
  const { userSettings, userId: currentUserId } = useUserSettings();
  const { settings } = useSettingsContext();
  const votes = useLinkedVotes(task.linkedVoteIds);

  const [linkedVoteDialogOpen, setLinkedVoteDialogOpen] = React.useState(false);

  React.useEffect(() => {
    if (task.linkedVoteIds && task.linkedVoteIds.length > 0) {
      loadVotes();
    }
  }, [task.linkedVoteIds]);
  const weekStartsOn = settings.weekStartDay as 0 | 1;
  const { cardCompactness } = useViewDisplay();
  const aging = useCardAging(task);

  const isUltraCompact = cardCompactness === COMPACTNESS_ULTRA;
  const isCompact = cardCompactness === COMPACTNESS_COMPACT;
  const isFull = cardCompactness === COMPACTNESS_FULL;

  // Keep hover-gated controls mounted while any portaled dropdown is open
  // so the card does not collapse when the pointer moves into the dropdown.
  const showHoverControls = isHovered || isAnyDropdownOpen;

  React.useEffect(() => {
    setCommentText(task.comment || "");
  }, [task.comment]);

  React.useEffect(() => {
    setDurationValue(task.durationInMinutes ?? "");
  }, [task.durationInMinutes]);

  // Effect to update the local offsetMinutes state based on existing scheduled reminder
  React.useEffect(() => {
    const existingReminder = scheduledReminders.find(
      (r) => r.taskId === task.id && r.originalTriggerDate === new Date(task.terminationDate || 0).toISOString(),
    );
    if (existingReminder?.offsetMinutes !== undefined) {
      setOffsetMinutes(existingReminder.offsetMinutes);
      setReminderStatus('scheduled'); // Optimistic update
    } else {
      setOffsetMinutes(-1); // "No reminder"
      // Don't reset status here, main effect will handle it
    }
  }, [task.id, task.terminationDate, scheduledReminders]);

  React.useEffect(() => {
    // Check if there's any active reminder for the current task
    const hasScheduled = scheduledReminders.some(
      (r) => r.taskId === task.id && r.triggerDate && new Date(r.triggerDate) > new Date()
    );
    // Also check for triggered but unread reminders
    const hasTriggered = reminders.some(
      (r) => r.taskId === task.id && !r.read
    );
    if (hasTriggered) {
      setReminderStatus('triggered');
    } else if (hasScheduled) {
      setReminderStatus('scheduled');
    } else {
      setReminderStatus('none');
    }
  }, [task.id, scheduledReminders, reminders]);

  const handleCardDoubleClick = (e: React.MouseEvent) => {
    // Prevent opening if clicking on interactive elements that might bubble up
    // (Though most should handle their own stopPropagation)
    if (e.defaultPrevented) return;

    setIsEditModalOpen(true);
  };
  // The line below was a duplicate and has been removed.
  //   setIsReminderActive(activeReminder);
  // }, [task.id, scheduledReminders]);

  const hasSubtasks = !!task.children && task.children.length > 0;
  // Parent cards render aggregate time/difficulty over all descendants. The
  // memo comparator only sees direct children, so keep the tasks subscription
  // for parents to refresh aggregates when a deeper descendant changes.
  const { calculateTotalTime, calculateTotalDifficulty, updateLinkedVoteIds } = useTasks({ subscribe: hasSubtasks });
  const effectiveSubtaskTasks = subtaskTasks ?? tasks ?? EMPTY_TASKS;
  const effectiveModalTasks = tasksForModal ?? tasks ?? EMPTY_TASKS;
  const canHaveTimer = !hasSubtasks; // Only tasks without children can have timers

  const taskTimerRunning = task.timer?.some(e => !e.endTime);
  const totalDifficulty = hasSubtasks ? calculateTotalDifficulty(task.id) : task.difficulty || 0;
  const totalTime = hasSubtasks ? calculateTotalTime(task.id) : (task.timer || []).reduce((acc, entry) => {
    if (entry.endTime) {
      return acc + (entry.endTime - entry.startTime);
    }
    return acc;
  }, 0);

  const handleToggleDoneSmart = React.useCallback(
    (task: Task) => {
      toggleDone(task);
    },
    [toggleDone],
  );

  const handleUserChange = React.useCallback((selectedId: string | undefined) => {
    updateUser(task.id, selectedId === 'current-user' ? currentUserId : selectedId);
  }, [updateUser, task.id, currentUserId]);

  const handleStatusChange = React.useCallback((status: TriageStatus) => {
    updateStatus(task.id, status);
  }, [updateStatus, task.id]);

  const handleCategoryChange = React.useCallback((category: Category | "none" | undefined) => {
    updateCategory(task.id, category === "none" ? undefined : category);
  }, [updateCategory, task.id]);

  const handleNavigateToVote = React.useCallback((voteId: string) => {
    const vote = votes.find((v) => v.id === voteId);
    if (vote?.slug) {
      window.open(`${window.location.origin}/v/${vote.slug}`, "_blank");
    }
  }, [votes]);

  const handleCreateLinkedVote = React.useCallback(() => {
    setLinkedVoteDialogOpen(true);
  }, []);

  const handleCloseEditModal = React.useCallback(() => {
    setIsEditModalOpen(false);
  }, []);

  // Listen for openTimeSheet events from the timetable
  React.useEffect(() => {
    const handleOpenTimeSheet = (event: CustomEvent) => {
      console.log('Received openTimeSheet event:', event.detail);
      if (event.detail.taskId === task.id) {
        console.log('Opening TimeSheet for task:', task.id);
        setIsTimeSheetOpen(true);
        // Store the entry index to scroll to it when the TimeSheet opens
        if (event.detail.entryIndex !== undefined) {
          // We'll use a global variable to pass this information to TimeSheet
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).scrollToTimeEntryIndex = event.detail.entryIndex;
        }
      }
    };

    window.addEventListener('openTimeSheet', handleOpenTimeSheet as EventListener);
    return () => {
      window.removeEventListener('openTimeSheet', handleOpenTimeSheet as EventListener);
    };
  }, [task.id]);

  return (
    <Card
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      ref={ref}
      className={cn(
        `mb-2 transition-all duration-200 hover:shadow-md ${isActive ? "ring-2 ring-primary" : ""} ${isHighlighted ? "ring-2 ring-yellow-400 bg-yellow-50 dark:bg-yellow-900/20" : ""}`,
        isUltraCompact ? "p-2" : "p-3",
        aging.className
      )}
      onClick={() => onActivate?.(task.id, columnIndex, isSearchResult)}
      onDoubleClick={handleCardDoubleClick}
      draggable={!disableReparenting}
      onDragStart={disableReparenting ? undefined : (e) => {
        e.dataTransfer.setData("text/task-id", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={disableReparenting ? undefined : (e) => {
        if (e.dataTransfer.types.includes("text/task-id")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={disableReparenting ? undefined : (e) => {
        const dragId = e.dataTransfer.getData("text/task-id");
        if (!dragId || dragId === task.id) return;
        e.preventDefault();
        e.stopPropagation();
        reparent(dragId, task.id);
      }}
      data-active-card={isActive ? "true" : undefined}
    >
      <AgingDecorations level={aging.level} />
      <div
        className="flex justify-between items-center mb-2"
      >
         <div className={`flex justify-start gap-1 transition-opacity duration-200 ${isUltraCompact ? (showHoverControls ? 'opacity-100' : 'opacity-0') : 'opacity-100'}`}>
            {(isUltraCompact ? showHoverControls : true) && (
             <>
               <div className="flex gap-1 items-center">
                 <LiveTimeBadge
                   task={task}
                   totalTime={hasSubtasks ? totalTime : undefined}
                   onClick={() => {
                     if (onFocusOnTask) {
                       onFocusOnTask(task.id);
                     }
                   }}
                 />
               </div>
               <div className="text-muted-foreground">/</div>
               {hasSubtasks ? (
                 <DifficultyBadge difficulty={totalDifficulty} />
               ) : (
                  <Select value={task.difficulty?.toString() || "1"} onValueChange={(v) => updateDifficulty(task.id, parseFloat(v) as 0.5 | 1 | 2 | 3 | 5 | 8)} onOpenChange={handleDropdownOpenChange}>
                   <SelectTrigger className="h-6 w-16 p-0">
                     <SelectValue>
                       {task.difficulty ? (
                         <div className="flex items-center">
                           <div className={`w-3 h-3 rounded-full ${getDifficultyColor(task.difficulty)} mr-2`} />
                           <span>{task.difficulty}</span>
                         </div>
                       ) : (
                         <div className="flex items-center">
                           <div className={`w-3 h-3 rounded-full ${getDifficultyColor(1)} mr-2`} />
                           <span>1</span>
                         </div>
                       )}
                     </SelectValue>
                   </SelectTrigger>
                   <SelectContent>
                      {DIFFICULTY_OPTIONS.map((difficulty) => (
                        <SelectItem key={difficulty} value={difficulty.toString()}>
                          <div className="flex items-center">
                            <div className={`w-3 h-3 rounded-full ${getDifficultyColor(difficulty)} mr-2`} />
                            <span>{difficulty}</span>
                            {difficulty === 8 && (
                              <span className="text-xs text-muted-foreground ml-2">{t('task.difficulty8Hint')}</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                   </SelectContent>
                 </Select>
               )}
             </>
           )}
         </div>
         {/* Timer controls - show in Compact/Full always, Ultra Compact on hover */}
         {!hasSubtasks && (
           isUltraCompact ? (
              <div className={`flex items-center gap-2 transition-opacity duration-200 ${showHoverControls ? 'opacity-100' : 'opacity-0'}`}>
                 {showHoverControls && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTimer(task.id, currentUserId);
                      }}
                    >
                      {taskTimerRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button
                     size="sm"
                     variant="ghost"
                     className="h-6 w-6 p-0"
                     onClick={(e) => { e.stopPropagation(); setIsTimeSheetOpen(true); }}
                   >
                     <Clock2 className="h-4 w-4" />
                   </Button>
                 </>
               )}
             </div>
           ) : (
              <div className="flex items-center gap-2">
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTimer(task.id, currentUserId);
                    }}
                  >
                    {taskTimerRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                </>
                <Button
                 size="sm"
                 variant="ghost"
                 className="h-6 w-6 p-0"
                 onClick={(e) => { e.stopPropagation(); setIsTimeSheetOpen(true); }}
               >
                 <Clock2 className="h-4 w-4" />
               </Button>
             </div>
           )
         )}
         {/* Date picker toggle - show in Compact/Full always, Ultra Compact on hover */}
         {!task.parentId && (
           isUltraCompact ? (
              <div className={`flex items-center gap-2 transition-opacity duration-200 ${showHoverControls ? 'opacity-100' : 'opacity-0'}`}>
                {showHoverControls && (
                 <Button
                   size="sm"
                   variant="ghost"
                   className="h-6 w-6 p-0"
                   onClick={(e) => {
                     e.stopPropagation();
                     setIsDateTimeBlockOpen(!isDateTimeBlockOpen);
                   }}
                 >
                   <CalendarIcon className={`h-4 w-4 ${((!hasSubtasks && (task.terminationDate || task.durationInMinutes)) || isDateTimeBlockOpen) ? "text-blue-500" : "text-gray-400"}`} />
                 </Button>
               )}
             </div>
           ) : (
             <div className="flex items-center gap-2">
               <Button
                 size="sm"
                 variant="ghost"
                 className="h-6 w-6 p-0"
                 onClick={(e) => {
                   e.stopPropagation();
                   setIsDateTimeBlockOpen(!isDateTimeBlockOpen);
                 }}
               >
                 <CalendarIcon className={`h-4 w-4 ${((!hasSubtasks && (task.terminationDate || task.durationInMinutes)) || isDateTimeBlockOpen) ? "text-blue-500" : "text-gray-400"}`} />
               </Button>
             </div>
           )
         )}
      </div>
      {isDateTimeBlockOpen && !task.parentId && (
        <div className="flex flex-col gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Popover onOpenChange={handleDropdownOpenChange}>
               <PopoverTrigger asChild>
                 <Button
                   variant={"outline"}
                   className={cn(
                     "flex-1 h-7 px-2 py-1 text-xs justify-start text-left font-normal",
                     !task.terminationDate && "text-muted-foreground"
                   )}
                   onClick={(e) => e.stopPropagation()}
                 >
                  <CalendarIcon className="mr-2 h-3 w-3" />
                   {task.terminationDate ? (
                     format(new Date(task.terminationDate), "PPP p")
                   ) : (
                     <span>{t('task.pickDate')}</span>
                   )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start" onClick={(e) => e.stopPropagation()}>
                <Calendar
                  mode="single"
                  selected={task.terminationDate ? new Date(task.terminationDate) : undefined}
                  onSelect={(date) => {
                    if (date) {
                      const current = task.terminationDate ? new Date(task.terminationDate) : new Date();
                      // Preserve time from current selection or default to current time
                      date.setHours(current.getHours(), current.getMinutes(), current.getSeconds());

                      const newTimestamp = date.getTime();
                      updateTerminationDate(task.id, newTimestamp);
                      updateScheduledReminderTriggerDate(task.id, date.toISOString(), offsetMinutes);
                    } else {
                      updateTerminationDate(task.id, undefined);
                      updateScheduledReminderTriggerDate(task.id, undefined, offsetMinutes);
                    }
                  }}
                  initialFocus
                  weekStartsOn={weekStartsOn}
                />
                <div className="p-3 border-t border-border">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setTimePickerOpen(true)}
                  >
                    <Clock className="mr-2 h-4 w-4" />
                     {task.terminationDate ? (
                       format(new Date(task.terminationDate), "HH:mm")
                     ) : (
                       <span className="text-muted-foreground">{t('task.setTime')}</span>
                     )}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div style={{ display: "flex", alignItems: "center" }} className={`ml-1 gap-2 text-xs flex-1 cursor-pointer select-none`}>
            {t('task.plannedDuration')}
            <Input
              type="number"
              placeholder={t('task.durationPlaceholder')}
              min="0"
              value={durationValue}
              onChange={(e) => setDurationValue(e.target.value)}
              onBlur={(e) => {
                const duration = parseInt(e.target.value);
                updateDurationInMinutes(task.id, isNaN(duration) ? undefined : duration);
              }}
              className="w-24 h-7 px-2 py-1 text-xs text-center"
              onClick={(e) => e.stopPropagation()}
            />
            <Popover onOpenChange={handleDropdownOpenChange}>
               <PopoverTrigger asChild>
                 <Button
                   size="sm"
                   variant="ghost"
                   className="h-6 w-6 p-0"
                   onClick={(e) => e.stopPropagation()}
                 >
                   <BellRing className={`h-4 w-4 ${reminderStatus === 'triggered' ? "text-red-500 fill-red-500" :
                      reminderStatus === 'scheduled' ? "text-blue-500 fill-blue-500" :
                        "text-gray-400"
                    }`} />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-40 p-0">
                 <Select
                   value={offsetMinutes.toString()}
                   onValueChange={(value) => {
                     const newOffset = parseInt(value);
                     setOffsetMinutes(newOffset);
                     if (newOffset === -1) { // "No reminder" selected
                       dismissReminder(task.id); // Dismiss any existing reminder for this task
                       // let effect update status
                     } else if (task.terminationDate) {
                       // Check if a reminder with the same taskId and originalTriggerDate already exists
                       const existingReminder = scheduledReminders.find(
                         r => r.taskId === task.id &&
                           r.originalTriggerDate === new Date(task.terminationDate || 0).toISOString()
                       );

                        if (existingReminder) {
                          // If it exists, update it instead of creating a new one
                          updateScheduledReminderTriggerDate(task.id, new Date(task.terminationDate).toISOString(), newOffset);
                        } else {
                          const dueDateIso = new Date(task.terminationDate).toISOString();
                          const titleKey = 'notifications.taskReminder.title';
                          const titleParams = { title: task.title };
                          const descriptionKey = 'notifications.taskReminder.description';
                          // Store the raw ISO date; NotificationCenter formats it
                          // locale-aware at render time so it re-localizes on switch.
                          const descriptionParams = { date: dueDateIso };
                          addReminder({
                            title: t(titleKey, titleParams),
                            description: t(descriptionKey, { formattedDate: format(new Date(dueDateIso), "PPP p") }),
                            titleKey,
                            titleParams,
                            descriptionKey,
                            descriptionParams,
                            persistent: true,
                            triggerDate: dueDateIso,
                            taskId: task.id,
                            offsetMinutes: newOffset,
                         });
                       }
                     }
                   }}
                   onOpenChange={handleDropdownOpenChange}
                 >
                   <SelectTrigger className="h-7 w-full text-xs">
                     <SelectValue placeholder={t('task.setReminder')} />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="-1">{t('task.reminder.none')}</SelectItem>
                     <SelectItem value="0">{t('task.reminder.onTime')}</SelectItem>
                     <SelectItem value="15">{t('task.reminder.15Min')}</SelectItem>
                     <SelectItem value="60">{t('task.reminder.1Hour')}</SelectItem>
                     <SelectItem value="120">{t('task.reminder.2Hours')}</SelectItem>
                     <SelectItem value="1440">{t('task.reminder.1Day')}</SelectItem>
                     <SelectItem value="10080">{t('task.reminder.1Week')}</SelectItem>
                   </SelectContent>
                </Select>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
        {hasSubtasks ? (
          <Folder className="h-4 w-4 text-muted-foreground" />
        ) : (
          <input
            type="checkbox"
            className="h-4 w-4 accent-orange-500"
            checked={task.triageStatus === "Done"}
            onChange={(e) => {
              e.stopPropagation();
              handleToggleDoneSmart(task);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <EditableTitle
          title={task.title}
          done={task.triageStatus === "Done" || task.triageStatus === "Dropped"}
          onUpdateTitle={(title) => updateTitle(task.id, title)}
        />
        {task.children && task.children.length > 0 && (
          <SubtaskProgress task={task} tasks={effectiveSubtaskTasks} />
        )}
        {/* Comment icon - show in Compact/Full always, Ultra Compact on hover */}
        {isUltraCompact ? (
           <div className={`transition-opacity duration-200 ${showHoverControls ? 'opacity-100' : 'opacity-0'}`}>
             {showHoverControls && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCommentModalOpen(true);
                }}
              >
                <FileText className={`h-4 w-4 ${task.comment ? "text-blue-500" : "text-gray-400"}`} />
              </Button>
            )}
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setIsCommentModalOpen(true);
            }}
          >
            <FileText className={`h-4 w-4 ${task.comment ? "text-blue-500" : "text-gray-400"}`} />
          </Button>
        )}
      </div>
      {/* Subtasks toggle - show in ALL modes (Ultra, Compact, Full) */}
      {hasSubtasks && onToggleOpen && (
        <div className="flex justify-between items-center mt-2">
          <div className="flex flex-col gap-2">
            <button
              className="inline-flex items-center text-xs px-2 py-1 rounded-md border hover:bg-accent/60 transition w-fit"
              onClick={(e) => {
                e.stopPropagation(); // Prevent onActivate from being called
                onToggleOpen(task.id, true);
              }}
              aria-pressed={open}
            >
               {open ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
               {t('task.subtasks')}
              <SubtaskProgress task={task} tasks={effectiveSubtaskTasks} />
            </button>
            <div className="flex flex-wrap gap-1">
              {task.urgent && (
                <Badge
                  variant="destructive"
                  className="cursor-default"
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {t('task.badge.urgent')}
                 </Badge>
               )}
               {task.impact && (
                 <Badge
                   variant="secondary"
                   className="bg-yellow-500 hover:bg-yellow-600 text-yellow-900 cursor-default"
                 >
                   <CircleDot className="h-3 w-3 mr-1" />
                   {t('task.badge.highImpact')}
                 </Badge>
               )}
               {task.majorIncident && (
                 <Badge
                   variant="destructive"
                   className="bg-red-700 hover:bg-red-800 text-white cursor-default"
                 >
                   <Flame className="h-3 w-3 mr-1" />
                   {t('task.badge.incidentOnDelivery')}
                 </Badge>
               )}
               {task.sprintTarget && (
                 <Badge
                   variant="secondary"
                   className="bg-violet-500 hover:bg-violet-600 text-violet-100 cursor-default"
                 >
                   <Crosshair className="h-3 w-3 mr-1" />
                   {t('task.badge.sprintTarget')}
                </Badge>
              )}
            </div>
          </div>
          <UserSelector
            value={task.userId || ''}
            onChange={handleUserChange}
          />
        </div>
      )}
      {/* UserSelector and Badges for non-subtasks */}
      {!hasSubtasks && (
        <div className="mt-2 flex justify-between items-center">
          <div className="flex flex-wrap gap-1">
            {task.urgent && !task.parentId && (
              <Badge
                variant="destructive"
                className="mb-2 cursor-default"
              >
                <AlertTriangle className="h-3 w-3 mr-1" />
                {t('task.badge.urgent')}
              </Badge>
            )}
            {task.impact && !task.parentId && (
              <Badge
                variant="secondary"
                className="bg-yellow-500 hover:bg-yellow-600 text-yellow-900 mb-2 cursor-default"
              >
                <CircleDot className="h-3 w-3 mr-1" />
                {t('task.badge.highImpact')}
              </Badge>
            )}
            {task.majorIncident && !task.parentId && (
              <Badge
                variant="destructive"
                className="bg-red-700 hover:bg-red-800 text-white mb-2 cursor-default"
              >
                <Flame className="h-3 w-3 mr-1" />
                {t('task.badge.incidentOnDelivery')}
              </Badge>
            )}
            {task.sprintTarget && !task.parentId && (
              <Badge
                variant="secondary"
                className="bg-violet-500 hover:bg-violet-600 text-violet-100 mb-2 cursor-default"
              >
                <Crosshair className="h-3 w-3 mr-1" />
                {t('task.badge.sprintTarget')}
              </Badge>
            )}
          </div>
          {/* UserSelector - always show? "shows only the card name and the user assigned to it" - Yes */}
          <UserSelector
            value={task.userId || ''}
            onChange={handleUserChange}
          />
        </div>
      )}
      {/* Category Select - show in Full or when hovered (any compactness) */}
      {canHaveTimer && (isFull || showHoverControls) && (
        <div className="flex flex-col gap-2 w-full">
          <CategorySelect
            value={task.category || "none"}
            onChange={handleCategoryChange}
            className="w-full"
            onOpenChange={handleDropdownOpenChange}
          />
        </div>
      )}
      {/* Bottom controls - Status and extra buttons */}
      {/* 
          Ultra Compact: Status hidden until hover.
          Compact: Status hidden until hover.
          Full: Show Status.
      */}
      <div className="mt-2 flex justify-between items-center">
        {isFull ? (
          <div className="flex items-center gap-2">
            <TaskStatusSelect value={task.triageStatus} onChange={handleStatusChange} />
          </div>
        ) : (
          <div className={`flex items-center gap-2 transition-opacity duration-200 ${showHoverControls ? 'opacity-100' : 'opacity-0'}`}>
            {showHoverControls && (
              <TaskStatusSelect
                value={task.triageStatus}
                onChange={handleStatusChange}
                onOpenChange={handleDropdownOpenChange}
              />
            )}
          </div>
        )}
          {!task.parentId && (
            <div className={`flex gap-1 transition-opacity duration-200 ${showHoverControls ? 'opacity-100' : 'opacity-0'} ${isFull ? '' : 'ml-auto'}`}>
              {showHoverControls && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleUrgent(task.id);
                    }}
                  >
                    <AlertTriangle className={`h-4 w-4 ${task.urgent ? "text-red-500" : "text-gray-400"}`} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleImpact(task.id);
                    }}
                  >
                    <CircleDot className={`h-4 w-4 ${task.impact ? "text-yellow-500" : "text-gray-400"}`} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMajorIncident(task.id);
                    }}
                  >
                    <Flame className={`h-4 w-4 ${task.majorIncident ? "text-red-700" : "text-gray-400"}`} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSprintTarget(task.id);
                    }}
                  >
                    <Crosshair className={`h-4 w-4 ${task.sprintTarget ? "text-violet-500" : "text-gray-400"}`} />
                  </Button>
                  <LinkedVoteButton
                    taskId={task.id}
                    taskTitle={task.title}
                    linkedVoteIds={task.linkedVoteIds}
                    linkedVotes={votes}
                    onNavigateToVote={handleNavigateToVote}
                    onCreateLinkedVote={handleCreateLinkedVote}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateTaskStructure(task.id);
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                    </svg>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 hover:text-red-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTask(task.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          )}
          {task.parentId && (
            <div className={`flex gap-1 transition-opacity duration-200 ${showHoverControls ? 'opacity-100' : 'opacity-0'} ${isFull ? '' : 'ml-auto'}`}>
              {showHoverControls && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateTaskStructure(task.id);
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                    </svg>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 hover:text-red-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTask(task.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      {/* Task Edit Modal - only mount when opened to save DOM */}
      {isEditModalOpen && (
        <TaskEditModal
          task={task}
          tasks={effectiveModalTasks}
          isOpen={isEditModalOpen}
          onClose={handleCloseEditModal}
          updateTitle={updateTitle}
          updateComment={updateComment}
          updateStatus={updateStatus}
          updateCategory={updateCategory}
          updateDifficulty={updateDifficulty}
          updateUser={updateUser}
          updateTerminationDate={updateTerminationDate}
          updateDurationInMinutes={updateDurationInMinutes}
          toggleUrgent={toggleUrgent}
          toggleImpact={toggleImpact}
          toggleMajorIncident={toggleMajorIncident}
          toggleSprintTarget={toggleSprintTarget}
          onToggleTimer={toggleTimer}
          currentUserId={currentUserId}
          updateLinkedVoteIds={updateLinkedVoteIds}
        />
      )}
      {/* Create Linked Vote Dialog */}
      <CreateLinkedVoteDialog
        open={linkedVoteDialogOpen}
        onOpenChange={setLinkedVoteDialogOpen}
        taskId={task.id}
        taskTitle={task.title}
        taskComment={task.comment}
        onSave={async (input) => {
          const newVote = await createVote(input);
          if (newVote) {
            const currentIds = task.linkedVoteIds || [];
            await updateLinkedVoteIds(task.id, [...currentIds, newVote.id]);
            setLinkedVoteDialogOpen(false);
          }
          return newVote;
        }}
      />
      {/* Comment Modal */}
      {isCommentModalOpen && (
        <Dialog open={isCommentModalOpen} onOpenChange={setIsCommentModalOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{t('task.editCommentTitle', { title: task.title })}</DialogTitle>
              <DialogDescription className="sr-only">
                {t('task.editCommentDescription', { title: task.title })}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 flex-1 min-h-0 overflow-y-auto">
              <div className="grid gap-2">
                <label htmlFor="comment" className="sr-only">{t('task.commentLabel')}</label>
                <RichTextField
                  value={commentText}
                  onChange={(json) => setCommentText(json)}
                  label={t('task.commentFieldLabel')}
                  placeholder={t('task.commentPlaceholder')}
                  className="min-h-[200px]"
                />
              </div>
            </div>
            <div className="flex justify-end shrink-0">
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  updateComment(task.id, commentText);
                  setIsCommentModalOpen(false);
                }}
              >
                {t('task.saveComment')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {/* TimeSheet Dialog */}
      {!hasSubtasks && (
        <TimeSheetDialog
          taskId={task.id}
          taskTitle={task.title}
          open={isTimeSheetOpen}
          onOpenChange={setIsTimeSheetOpen}
        />
      )}
      {/* Time Picker Dialog for termination date time */}
      <TimePickerDialog
        isOpen={timePickerOpen}
        onClose={() => setTimePickerOpen(false)}
        initialTime={task.terminationDate || Date.now()}
        onTimeChange={(timestamp) => {
          updateTerminationDate(task.id, timestamp);
          updateScheduledReminderTriggerDate(task.id, new Date(timestamp).toISOString(), offsetMinutes);
        }}
      />
    </Card>
  );
});

export const TaskCard = React.memo(TaskCardInner, areTaskCardPropsEqual);
