import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GripVertical, Folder, AlertTriangle, CircleDot, Trash2, Clock2, Play, Pause, ChevronDown, ChevronRight, Flame, FileText, BellRing, CalendarIcon, User } from "lucide-react";
import { TaskStatusSelect } from "./TaskStatusSelect";
import { useTasks, Task, Category, TriageStatus } from "@/hooks/useTasks";
import { Badge } from "@/components/ui/badge";
import { eventBus } from "@/lib/events";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { TimeSheet } from "./TimeSheet";
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
import { UserAvatar } from "./UserAvatar";
import { UserSelector } from "./UserSelector";
import { useUserSettings } from "@/hooks/useUserSettings";
import { Calendar } from "@/components/ui/calendar";
import { useCombinedSettings } from "@/hooks/useCombinedSettings";
import { useView } from "@/hooks/useView";
import { COMPACTNESS_ULTRA, COMPACTNESS_COMPACT, COMPACTNESS_FULL } from "@/context/ViewContextDefinition";

const LiveTimeBadge: React.FC<{ task: Task; totalTime?: number; onClick?: () => void }> = React.memo(({ task, totalTime, onClick }) => {
  const [runningTime, setRunningTime] = React.useState(0);

  const totalCompletedTime = React.useMemo(() => {
    return (task.timer || []).reduce((acc, entry) => {
      if (entry.endTime && entry.endTime > 0) {
        return acc + (entry.endTime - entry.startTime);
      }
      return acc;
    }, 0);
  }, [task.timer]);

  React.useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    const updateTimer = () => {
      const runningTimer = (task.timer || []).find((e) => e.endTime === 0);
      if (runningTimer && runningTimer.startTime) {
        const elapsed = Date.now() - runningTimer.startTime!;
        setRunningTime(elapsed);
      } else {
        setRunningTime(0);
      }
    };

    updateTimer(); // Initial update
    interval = setInterval(updateTimer, 1000);

    const onTimerToggled = () => {
      updateTimer(); // Force update when any timer is toggled
    };
    eventBus.subscribe("timerToggled", onTimerToggled);

    return () => {
      if (interval) {
        clearInterval(interval);
      }
      eventBus.unsubscribe("timerToggled", onTimerToggled);
    };
  }, [task.id, task.timer]);

  const displayTime = totalTime !== undefined ? totalTime : totalCompletedTime + runningTime;

  return (
    <Badge variant="outline" className="text-xs cursor-pointer" onClick={onClick}>
      {formatDuration(displayTime)}
    </Badge>
  );
});

// Editable title component that switches between display and edit modes
const EditableTitle: React.FC<{
  title: string;
  done?: boolean;
  onUpdateTitle: (title: string) => void;
}> = ({ title, done, onUpdateTitle }) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(title);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = () => {
    setEditValue(title);
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (editValue.trim() !== title) {
      onUpdateTitle(editValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      setIsEditing(false);
      if (editValue.trim() !== title) {
        onUpdateTitle(editValue);
      }
    } else if (e.key === "Escape") {
      setEditValue(title);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="h-6 px-1 py-0 text-sm"
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      className={`text-md flex-1 ${done ? "line-through text-muted-foreground" : ""} cursor-pointer select-none`}
      onDoubleClick={handleDoubleClick}
    >
      <b>
        {title}
      </b>
    </span>
  );
};


const DIFFICULTY_OPTIONS: Array<0.5 | 1 | 2 | 3 | 5 | 8> = [0.5, 1, 2, 3, 5, 8];

const getDifficultyColor = (difficulty: number) => {
  // Green to red gradient mapping
  const colors = {
    0.5: "bg-green-500",
    1: "bg-green-400",
    2: "bg-yellow-400",
    3: "bg-yellow-500",
    5: "bg-orange-500",
    8: "bg-red-500",
  };
  return colors[difficulty as keyof typeof colors] || "bg-gray-500";
};

const DifficultyBadge: React.FC<{ difficulty: number }> = ({ difficulty }) => {
  const getFibonacciDifficulty = (value: number) => {
    const fib = [0.5, 1, 2, 3, 5, 8];
    if (value > 8) return { value: 8, plus: true };
    return { value: fib.find((f) => f >= value) || 8, plus: false };
  };

  const { value, plus } = getFibonacciDifficulty(difficulty);
  const color = getDifficultyColor(value);

  return (
    <div className={`flex items-center h-6 w-16 p-0`}>
      <div className={`w-3 h-3 rounded-full ${plus ? 'bg-red-200' : color} mr-2`} />
      <span>{value}{plus && '+'}</span>
    </div>
  );
};



interface TaskCardProps {
  task: Task;
  tasks: Task[];
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
  toggleDone: (task: Task) => void;
  toggleTimer: (id: string) => void;
  reparent: (id: string, parentId: string | null) => void;
  onActivate?: (id: string) => void;
  isActive?: boolean;
  isHighlighted?: boolean; // Added for search result highlighting
  isTriageBoard?: boolean;
  open?: boolean;
  onToggleOpen?: (id: string, toggleAll?: boolean) => void;
  onFocusOnTask?: (taskId: string) => void;
  disableReparenting?: boolean; // New prop to disable reparenting on drop
}

export const TaskCard = React.forwardRef<HTMLDivElement, TaskCardProps>((
  {
    task,
    tasks,
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
  },
  ref
) => {
  const [isTimeSheetOpen, setIsTimeSheetOpen] = React.useState(false);
  const [isCommentModalOpen, setIsCommentModalOpen] = React.useState(false);
  const [commentText, setCommentText] = React.useState(task.comment || "");
  const [durationValue, setDurationValue] = React.useState(task.durationInMinutes || "");
  const [isDatePickerOpen, setIsDatePickerOpen] = React.useState(false);
  const [offsetMinutes, setOffsetMinutes] = React.useState(-1); // Default to -1 (No reminder)
  const [isDateTimeBlockOpen, setIsDateTimeBlockOpen] = React.useState(false); // New state for date/time block
  const [isReminderActive, setIsReminderActive] = React.useState(false); // New state for reminder active status
  const { scheduledReminders, updateScheduledReminderTriggerDate, dismissReminder } = useReminderStore();
  const { userSettings, userId: currentUserId } = useUserSettings();
  const { settings } = useCombinedSettings();
  const weekStartsOn = settings.weekStartDay as 0 | 1;
  const { cardCompactness } = useView();

  const isUltraCompact = cardCompactness === COMPACTNESS_ULTRA;
  const isCompact = cardCompactness === COMPACTNESS_COMPACT;
  const isFull = cardCompactness === COMPACTNESS_FULL;

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
      setIsReminderActive(true); // Set to true if a reminder exists
    } else {
      setOffsetMinutes(-1); // "No reminder"
      setIsReminderActive(false); // Set to false if no reminder exists
    }
  }, [task.id, task.terminationDate, scheduledReminders]);

  React.useEffect(() => {
    // Check if there's any active reminder for the current task
    const activeReminder = scheduledReminders.some(
      (r) => r.taskId === task.id && r.triggerDate && new Date(r.triggerDate) > new Date()
    );
    setIsReminderActive(activeReminder);
  }, [task.id, scheduledReminders]);

  const { calculateTotalTime, calculateTotalDifficulty } = useTasks();
  const hasSubtasks = task.children && task.children.length > 0;
  const canHaveTimer = !hasSubtasks; // Only tasks without children can have timers
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
    <div
      ref={ref}
      onClick={() => onActivate?.(task.id)}
      className={`w-full px-3 py-2 rounded-md border transition bg-card hover:bg-accent/40 ${isActive ? "ring-2 ring-orange-500 bg-orange-50 dark:bg-orange-950/30" : ""} ${isHighlighted ? "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/30" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task-id", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("text/task-id")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(e) => {
        if (disableReparenting) return; // Prevent reparenting if disabled
        const dragId = e.dataTransfer.getData("text/task-id");
        if (!dragId) return;
        reparent(dragId, task.id);
      }}
      data-active-card={isActive ? "true" : undefined}
    >
      <div
        className="flex justify-between items-center mb-2"
      >
        <div className="flex justify-start gap-1">
          <div className="flex gap-1 items-center">
            {/* Always show LiveTimeBadge unless in Ultra Compact mode? Requirement says: 
                Ultra Compact: "shows only the card name and the user assigned to it and the small icons of criticity"
                Second view: "time related stuff in addition"
            */}
            {!isUltraCompact && (
              <LiveTimeBadge
                task={task}
                totalTime={hasSubtasks ? totalTime : undefined}
                onClick={() => {
                  if (onFocusOnTask) {
                    onFocusOnTask(task.id);
                  }
                }}
              />
            )}
          </div>
          {!isUltraCompact && <div className="text-muted-foreground">/</div>}
          {/* Difficulty in Compact and Full mode */}
          {!isUltraCompact && (
            hasSubtasks ? (
              <DifficultyBadge difficulty={totalDifficulty} />
            ) : (
              <Select value={task.difficulty?.toString() || "1"} onValueChange={(v) => updateDifficulty(task.id, parseFloat(v) as 0.5 | 1 | 2 | 3 | 5 | 8)}>
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
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          )}
        </div>
        {/* Timer controls - show in Compact and Full */}
        {!hasSubtasks && !isUltraCompact && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation();
                toggleTimer(task.id);
              }}
            >
              {task.timer?.some(e => !e.endTime) ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Dialog open={isTimeSheetOpen} onOpenChange={setIsTimeSheetOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <Clock2 className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0" aria-describedby={undefined}>
                <DialogHeader className="p-6 pb-4">
                  <DialogTitle>Time Sheet - {task.title}</DialogTitle>
                  <DialogDescription className="sr-only">
                    View and edit time entries for task: {task.title}
                  </DialogDescription>
                </DialogHeader>
                <div className="flex-grow overflow-y-auto px-6 pb-6">
                  <TimeSheet taskId={task.id} />
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
        {/* Date picker toggle - show in Compact and Full */}
        {!task.parentId && !isUltraCompact && (
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
        )}
      </div>
      {isDateTimeBlockOpen && !task.parentId && (
        <div className="flex flex-col gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Popover>
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
                    <span>Pick a date</span>
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
                  <Input
                    type="time"
                    value={task.terminationDate ? format(new Date(task.terminationDate), "HH:mm") : ""}
                    onChange={(e) => {
                      if (task.terminationDate && e.target.value) {
                        const [hours, minutes] = e.target.value.split(':').map(Number);
                        const newDate = new Date(task.terminationDate);
                        newDate.setHours(hours, minutes);
                        const newTimestamp = newDate.getTime();
                        updateTerminationDate(task.id, newTimestamp);
                        updateScheduledReminderTriggerDate(task.id, newDate.toISOString(), offsetMinutes);
                      }
                    }}
                    className="w-full"
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div style={{ display: "flex", alignItems: "center" }} className={`ml-1 gap-2 text-xs flex-1 cursor-pointer select-none`}>
            Planed duration :
            <Input
              type="number"
              placeholder="min."
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
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <BellRing className={`h-4 w-4 ${isReminderActive ? "text-blue-500" : "text-gray-400"}`} />
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
                      setIsReminderActive(false); // Set reminder to inactive
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
                        addReminder({
                          title: `Task Reminder: ${task.title}`,
                          description: `This task is due on ${format(new Date(task.terminationDate), "PPP p")}`,
                          persistent: true,
                          triggerDate: new Date(task.terminationDate).toISOString(),
                          taskId: task.id,
                          offsetMinutes: newOffset,
                        });
                      }
                      setIsReminderActive(true); // Set reminder to active
                    }
                  }}
                >
                  <SelectTrigger className="h-7 w-full text-xs">
                    <SelectValue placeholder="Set Reminder" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-1">No reminder</SelectItem>
                    <SelectItem value="0">On time</SelectItem>
                    <SelectItem value="15">15 min before</SelectItem>
                    <SelectItem value="60">1 hour before</SelectItem>
                    <SelectItem value="120">2 hours before</SelectItem>
                    <SelectItem value="1440">1 day before</SelectItem>
                    <SelectItem value="10080">1 week before</SelectItem>
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
          done={task.triageStatus === "Done"}
          onUpdateTitle={(title) => updateTitle(task.id, title)}
        />
        {/* Comment icon - show in Compact and Full */}
        {!isUltraCompact && (
          <Dialog open={isCommentModalOpen} onOpenChange={setIsCommentModalOpen}>
            <DialogTrigger asChild>
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
            </DialogTrigger>
            <DialogContent className="max-w-md" aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle>Edit Comment - {task.title}</DialogTitle>
                <DialogDescription className="sr-only">
                  Edit comment for task: {task.title}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <label htmlFor="comment" className="sr-only">Comment</label>
                  <textarea
                    id="comment"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Add a comment..."
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    updateComment(task.id, commentText);
                    setIsCommentModalOpen(false);
                  }}
                >
                  Save Comment
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
      {/* Subtasks toggle - show in ALL modes (Ultra, Compact, Full) */}
      {hasSubtasks && onToggleOpen && (
        <div className="flex justify-between items-center mt-2">
          <button
            className="inline-flex items-center text-xs px-2 py-1 rounded-md border hover:bg-accent/60 transition"
            onClick={(e) => {
              e.stopPropagation(); // Prevent onActivate from being called
              onToggleOpen(task.id, true);
            }}
            aria-pressed={open}
          >
            {open ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
            Subtasks
          </button>
          <UserSelector
            value={task.userId || ''}
            onChange={(selectedId) => updateUser(task.id, selectedId === 'current-user' ? currentUserId : selectedId)}
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
                Urgent
              </Badge>
            )}
            {task.impact && !task.parentId && (
              <Badge
                variant="secondary"
                className="bg-yellow-500 hover:bg-yellow-600 text-yellow-900 mb-2 cursor-default"
              >
                <CircleDot className="h-3 w-3 mr-1" />
                High Impact
              </Badge>
            )}
            {task.majorIncident && !task.parentId && (
              <Badge
                variant="destructive"
                className="bg-red-700 hover:bg-red-800 text-white mb-2 cursor-default"
              >
                <Flame className="h-3 w-3 mr-1" />
                Incident on Delivery
              </Badge>
            )}
          </div>
          {/* UserSelector - always show? "shows only the card name and the user assigned to it" - Yes */}
          <UserSelector
            value={task.userId || ''}
            onChange={(selectedId) => updateUser(task.id, selectedId === 'current-user' ? currentUserId : selectedId)}
          />
        </div>
      )}
      {/* Category Select - show in Full only */}
      {canHaveTimer && isFull && (
        <div className="flex flex-col gap-2 w-full">
          <CategorySelect
            value={task.category || "none"}
            onChange={(category) => updateCategory(task.id, category === "none" ? undefined : category)}
            className="w-full"
          />
        </div>
      )}
      {/* Bottom controls - Status and extra buttons */}
      {/* 
          Ultra Compact: Hide Status.
          Compact: Hide Status ("takeaway the state column").
          Full: Show Status.
      */}
      {isFull && (
        <div className="mt-2 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <TaskStatusSelect value={task.triageStatus} onChange={(s) => updateStatus(task.id, s)} />
          </div>
          {!task.parentId && isFull && (
            <div className="flex gap-1">
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
            </div>
          )}
          {task.parentId && (
            <div className="flex gap-1">
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
            </div>
          )}
        </div>
      )}
    </div>
  );
});