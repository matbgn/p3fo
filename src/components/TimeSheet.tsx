import React from 'react';
import { useTasks } from '@/hooks/useTasks';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Trash2 } from 'lucide-react';
import { Temporal } from '@js-temporal/polyfill';
import './TimeSheet.css';

interface TimeSheetProps {
  taskId: string;
}

// Helper function to convert Unix timestamp to Europe/Zurich time string
const formatTimeWithTemporal = (ms: number): string => {
  if (ms <= 0) return 'Invalid Date';

  try {
    // Create an Instant from the timestamp
    const instant = Temporal.Instant.fromEpochMilliseconds(ms);
    // Convert to Zurich timezone
    const zurich = instant.toZonedDateTimeISO('Europe/Zurich');
    // Format as YYYY-MM-DD HH:MM:SS TZ HH:MM:SS
    const dateString = zurich.toLocaleString('sv-SE'); // YYYY-MM-DD
    const timeString = zurich.toPlainTime().toString({ smallestUnit: 'second' }); // HH:MM:SS
    // Get timezone abbreviation
    const timeZoneParts = zurich.toLocaleString('en-US', { timeZoneName: 'short' }).split(' ');
    const timeZoneString = timeZoneParts.length > 1 ? timeZoneParts[timeZoneParts.length - 1] : 'CET';
    return `${dateString} ${timeString} ${timeZoneString} ${timeString}`;
  } catch (error) {
    console.error('Error formatting time:', error);
    return 'Invalid Date';
  }
};

// Helper function to convert Unix timestamp to Temporal.Instant in Europe/Zurich
const timestampToZurichInstant = (timestamp: number): Temporal.Instant => {
  return Temporal.Instant.fromEpochMilliseconds(timestamp);
};

// Helper function to convert Temporal.Instant to Europe/Zurich PlainDateTime
const instantToZurichPlainDateTime = (instant: Temporal.Instant): Temporal.PlainDateTime => {
  const zurich = instant.toZonedDateTimeISO('Europe/Zurich');
  return zurich.toPlainDateTime();
};

// Helper function to convert Europe/Zurich PlainDateTime to Unix timestamp
const zurichPlainDateTimeToTimestamp = (plainDateTime: Temporal.PlainDateTime): number => {
  const zurich = plainDateTime.toZonedDateTime('Europe/Zurich');
  return zurich.epochMilliseconds;
};

// Helper function to format duration in HH:MM:SS
const formatDuration = (milliseconds: number): string => {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

export const TimeSheet: React.FC<TimeSheetProps> = ({ taskId }) => {
  const { tasks, updateTimeEntry, deleteTimeEntry } = useTasks();
  const task = tasks.find(t => t.id === taskId);
  const entryRefs = React.useRef<HTMLDivElement[]>([]);

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
        const startInstant = timestampToZurichInstant(entry.startTime);
        const startPlainDateTime = instantToZurichPlainDateTime(startInstant);

        const endInstant = entry.endTime && entry.endTime > 0
          ? timestampToZurichInstant(entry.endTime)
          : null;
        const endPlainDateTime = endInstant
          ? instantToZurichPlainDateTime(endInstant)
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
                <Input
                  type="datetime-local"
                  step="1"
                  value={startPlainDateTime.toString({ smallestUnit: 'second' }).slice(0, 19)}
                  onChange={(e) => {
                    try {
                      // Parse the input value and convert to Zurich time
                      const [datePart, timePart] = e.target.value.split('T');
                      const [year, month, day] = datePart.split('-').map(Number);
                      const [hour, minute, second] = timePart.split(':').map(Number);

                      // Create a PlainDateTime in Zurich timezone
                      const newPlainDateTime = Temporal.PlainDateTime.from({
                        year, month, day, hour, minute, second
                      });

                      const newTimestamp = zurichPlainDateTimeToTimestamp(newPlainDateTime);
                      handleUpdate(index, { ...entry, startTime: newTimestamp });
                    } catch (error) {
                      console.error('Invalid date input:', error);
                    }
                  }}
                  onKeyDown={(e) => {
                    // Handle keyboard navigation
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                      e.preventDefault();

                      try {
                        let newPlainDateTime = Temporal.PlainDateTime.from(startPlainDateTime);

                        if (e.key === 'ArrowUp') {
                          newPlainDateTime = newPlainDateTime.add({ seconds: 1 });
                        } else {
                          newPlainDateTime = newPlainDateTime.subtract({ seconds: 1 });
                        }

                        const newTimestamp = zurichPlainDateTimeToTimestamp(newPlainDateTime);
                        handleUpdate(index, { ...entry, startTime: newTimestamp });
                      } catch (error) {
                        console.error('Error adjusting time:', error);
                      }
                    }
                  }}
                  className="flex-1"
                />
              </div>

              <div className="flex items-center gap-2 mt-2">
                <div className="w-20 text-sm font-medium text-muted-foreground">End</div>
                <Input
                  type="datetime-local"
                  step="1"
                  value={endPlainDateTime ? endPlainDateTime.toString({ smallestUnit: 'second' }).slice(0, 19) : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      try {
                        // Parse the input value and convert to Zurich time
                        const [datePart, timePart] = e.target.value.split('T');
                        const [year, month, day] = datePart.split('-').map(Number);
                        const [hour, minute, second] = timePart.split(':').map(Number);

                        // Create a PlainDateTime in Zurich timezone
                        const newPlainDateTime = Temporal.PlainDateTime.from({
                          year, month, day, hour, minute, second
                        });

                        const newTimestamp = zurichPlainDateTimeToTimestamp(newPlainDateTime);
                        handleUpdate(index, { ...entry, endTime: newTimestamp });
                      } catch (error) {
                        console.error('Invalid date input:', error);
                      }
                    } else {
                      handleUpdate(index, { ...entry, endTime: 0 });
                    }
                  }}
                  onKeyDown={(e) => {
                    // Handle keyboard navigation
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      if (!endPlainDateTime) return;

                      try {
                        let newPlainDateTime = Temporal.PlainDateTime.from(endPlainDateTime);

                        if (e.key === 'ArrowUp') {
                          newPlainDateTime = newPlainDateTime.add({ seconds: 1 });
                        } else {
                          newPlainDateTime = newPlainDateTime.subtract({ seconds: 1 });
                        }

                        const newTimestamp = zurichPlainDateTimeToTimestamp(newPlainDateTime);
                        handleUpdate(index, { ...entry, endTime: newTimestamp });
                      } catch (error) {
                        console.error('Error adjusting time:', error);
                      }
                    }
                  }}
                  className={`flex-1 ${isNegativeDuration ? 'border-red-500' : ''}`}
                />
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
    </div>
  );
};