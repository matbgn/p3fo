import React from 'react';
import { useTasks } from '@/hooks/useTasks';
import { useAllTasks } from '@/hooks/useAllTasks';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Trash2, CalendarIcon, Clock } from 'lucide-react';
import { Temporal } from '@js-temporal/polyfill';
import './TimeSheet.css';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useCombinedSettings } from "@/hooks/useCombinedSettings";
import { TimePickerDialog } from "@/components/ui/time-picker-dialog";
import { timestampToInstant, formatDuration, instantToPlainDateTime } from '@/lib/format-utils';

interface TimeSheetProps {
  taskId: string;
}


export const TimeSheet: React.FC<TimeSheetProps> = ({ taskId }) => {
  const { tasks } = useAllTasks();
  const { updateTimeEntry, deleteTimeEntry } = useTasks();
  const { settings } = useCombinedSettings();
  const weekStartsOn = settings.weekStartDay as 0 | 1;
  const task = tasks.find(t => t.id === taskId);
  const entryRefs = React.useRef<HTMLDivElement[]>([]);

  // State for time picker dialog
  const [timePickerOpen, setTimePickerOpen] = React.useState(false);
  const [timePickerConfig, setTimePickerConfig] = React.useState<{
    index: number;
    type: 'start' | 'end';
    initialTime: number;
  } | null>(null);

  const openTimePicker = (index: number, type: 'start' | 'end', initialTime: number) => {
    setTimePickerConfig({ index, type, initialTime });
    setTimePickerOpen(true);
  };

  // Clean up any running timers when the component unmounts
  React.useEffect(() => {
    return () => {
      // Any cleanup code if needed
    };
  }, []);

  // Scroll to specific entry when requested
  React.useEffect(() => {
    // Check if we need to scroll to a specific entry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scrollToIndex = (window as any).scrollToTimeEntryIndex;
    if (scrollToIndex !== undefined && entryRefs.current[scrollToIndex]) {
      entryRefs.current[scrollToIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
      entryRefs.current[scrollToIndex].classList.add('timesheet-entry-highlight');
      // Clean up the global variable
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).scrollToTimeEntryIndex;
    }
  }, [task?.timer]);

  const handleUpdate = (index: number, entry: { startTime: number; endTime: number }) => {
    updateTimeEntry(taskId, index, entry);
  };

  const handleDelete = (index: number) => {
    deleteTimeEntry(taskId, index);
  };

  // State for running timer
  const [runningTime, setRunningTime] = React.useState<{ [key: number]: number }>({});

  // Update running timers
  React.useEffect(() => {
    if (!task) return;

    const interval = setInterval(() => {
      const newRunningTimes: { [key: number]: number } = {};
      task.timer?.forEach((entry, index) => {
        if (!entry.endTime || entry.endTime === 0) {
          newRunningTimes[index] = Date.now() - entry.startTime;
        }
      });
      setRunningTime(newRunningTimes);
    }, 1000);

    return () => clearInterval(interval);
  }, [task?.timer, task]);

  if (!task) {
    return <div>Task not found.</div>;
  }

  return (
    <div className="space-y-4">
      {task.timer?.map((entry, index) => {
        const startInstant = timestampToInstant(entry.startTime);
        const startPlainDateTime = instantToPlainDateTime(startInstant, settings.timezone);

        const endInstant = entry.endTime && entry.endTime > 0
          ? timestampToInstant(entry.endTime)
          : null;
        const endPlainDateTime = endInstant
          ? instantToPlainDateTime(endInstant, settings.timezone)
          : null;

        // Calculate duration
        const duration = entry.endTime && entry.endTime > 0
          ? entry.endTime - entry.startTime
          : runningTime[index] || 0;

        // Check if end time is before start time (negative duration)
        const isNegativeDuration = entry.endTime && entry.endTime > 0 && entry.endTime < entry.startTime;

        return (
          <div
            key={index}
            ref={el => entryRefs.current[index] = el as HTMLDivElement}
            className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors timesheet-entry"
          >
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="w-20 text-sm font-medium text-muted-foreground">Start</div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "flex-1 justify-start text-left font-normal",
                        !entry.startTime && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {entry.startTime ? (
                        format(new Date(entry.startTime), "PPP p")
                      ) : (
                        <span>No start time</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={entry.startTime ? new Date(entry.startTime) : undefined}
                      onSelect={(date) => {
                        if (date) {
                          const current = entry.startTime ? new Date(entry.startTime) : new Date();
                          date.setHours(current.getHours(), current.getMinutes(), current.getSeconds());
                          handleUpdate(index, { ...entry, startTime: date.getTime() });
                        }
                      }}
                      initialFocus
                      weekStartsOn={weekStartsOn}
                    />
                    <div className="p-3 border-t border-border flex flex-col gap-2">
                      <div className="flex gap-2 items-center">
                        <Input
                          id={`start-time-${index}`}
                          type="time"
                          value={entry.startTime ? format(new Date(entry.startTime), "HH:mm:ss") : ""}
                          onChange={(e) => {
                            if (e.target.value) {
                              const [hours, minutes, seconds] = e.target.value.split(':').map(Number);
                              const newDate = entry.startTime ? new Date(entry.startTime) : new Date();
                              newDate.setHours(hours, minutes, seconds || 0);
                              handleUpdate(index, { ...entry, startTime: newDate.getTime() });
                            }
                          }}
                          step="1"
                          className="flex-1"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openTimePicker(index, 'start', entry.startTime)}
                        >
                          <Clock className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <div className="w-20 text-sm font-medium text-muted-foreground">End</div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "flex-1 justify-start text-left font-normal",
                        (!entry.endTime || entry.endTime === 0) && "text-muted-foreground",
                        isNegativeDuration && "border-red-500"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {entry.endTime && entry.endTime > 0 ? (
                        format(new Date(entry.endTime), "PPP p")
                      ) : (
                        <span>Running...</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={entry.endTime && entry.endTime > 0 ? new Date(entry.endTime) : undefined}
                      onSelect={(date) => {
                        if (date) {
                          const current = entry.endTime && entry.endTime > 0 ? new Date(entry.endTime) : new Date();
                          date.setHours(current.getHours(), current.getMinutes(), current.getSeconds());
                          handleUpdate(index, { ...entry, endTime: date.getTime() });
                        } else {
                          // If cleared, maybe set to 0 (running)? Or just don't allow clearing here easily?
                          // Let's assume selecting a date sets it.
                          // Actually, if they deselect, maybe we should set it to 0?
                          // But standard calendar behavior is toggle.
                          // Let's just update if date is valid.
                        }
                      }}
                      initialFocus
                      weekStartsOn={weekStartsOn}
                    />
                    <div className="p-3 border-t border-border flex flex-col gap-2">
                      <div className="flex gap-2 items-center">
                        <Input
                          id={`end-time-${index}`}
                          type="time"
                          value={entry.endTime && entry.endTime > 0 ? format(new Date(entry.endTime), "HH:mm:ss") : ""}
                          onChange={(e) => {
                            if (e.target.value) {
                              const [hours, minutes, seconds] = e.target.value.split(':').map(Number);
                              const newDate = entry.endTime && entry.endTime > 0 ? new Date(entry.endTime) : new Date();
                              newDate.setHours(hours, minutes, seconds || 0);
                              handleUpdate(index, { ...entry, endTime: newDate.getTime() });
                            }
                          }}
                          step="1"
                          className="flex-1"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openTimePicker(index, 'end', entry.endTime || Date.now())}
                        >
                          <Clock className="h-4 w-4" />
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUpdate(index, { ...entry, endTime: 0 })}
                      >
                        Set to Running
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                {isNegativeDuration && (
                  <div className="text-red-500 text-sm">End time cannot be before start time</div>
                )}
              </div>
            </div>

            <div className="flex flex-col items-center justify-center min-w-[100px] px-3">
              {duration > 0 && (
                <div className="text-lg font-semibold timesheet-duration">
                  {formatDuration(duration)}
                </div>
              )}
              {(!entry.endTime || entry.endTime === 0) && (
                <div className="text-sm text-muted-foreground animate-pulse">Running</div>
              )}
            </div>

            <Button variant="destructive" size="icon" onClick={() => handleDelete(index)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
      {timePickerConfig && (
        <TimePickerDialog
          isOpen={timePickerOpen}
          onClose={() => setTimePickerOpen(false)}
          initialTime={timePickerConfig.initialTime}
          onTimeChange={(timestamp) => {
            if (task && task.timer && task.timer[timePickerConfig.index]) {
              const entry = task.timer[timePickerConfig.index];
              if (timePickerConfig.type === 'start') {
                handleUpdate(timePickerConfig.index, { ...entry, startTime: timestamp });
              } else {
                handleUpdate(timePickerConfig.index, { ...entry, endTime: timestamp });
              }
            }
          }}
        />
      )}
    </div>
  );
};