import React, { useState } from "react";
import { useTasks, Category } from "@/hooks/useTasks";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CategorySelect } from "./CategorySelect";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Trash2, Pencil, ArrowRight } from "lucide-react";
import { Temporal } from '@js-temporal/polyfill';
import { useNavigate } from "react-router-dom";
import { TaskTag } from "./TaskTag";

const PREDEFINED_RANGES = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "This Week", value: "thisWeek" },
  { label: "Last Week", value: "lastWeek" },
  { label: "This Month", value: "thisMonth" },
  { label: "Last Month", value: "lastMonth" },
  { label: "Year to Date", value: "ytd" },
];

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

// Editable time entry component
const EditableTimeEntry: React.FC<{
  entry: {
    taskId: string;
    taskTitle: string;
    taskCategory: string | undefined;
    taskParentId: string | undefined;
    index: number;
    startTime: number;
    endTime: number;
  };
  taskMap: Record<string, any>;
  onUpdate: (taskId: string, entryIndex: number, entry: { startTime: number; endTime: number }) => void;
  onDelete: (taskId: string, entryIndex: number) => void;
  onJumpToTask?: (taskId: string) => void;
}> = ({ entry, taskMap, onUpdate, onDelete, onJumpToTask }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  
  const startInstant = timestampToZurichInstant(entry.startTime);
  const startPlainDateTime = instantToZurichPlainDateTime(startInstant);
  
  const endInstant = entry.endTime > 0 
    ? timestampToZurichInstant(entry.endTime) 
    : null;
  const endPlainDateTime = endInstant 
    ? instantToZurichPlainDateTime(endInstant) 
    : null;

  // Calculate duration
  const duration = entry.endTime > 0 
    ? entry.endTime - entry.startTime 
    : Date.now() - entry.startTime;

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  };

  const handleEdit = () => {
    setEditStartTime(startPlainDateTime.toString({ smallestUnit: 'second' }).slice(0, 19));
    setEditEndTime(endPlainDateTime ? endPlainDateTime.toString({ smallestUnit: 'second' }).slice(0, 19) : '');
    setIsEditing(true);
  };

  // Handle double-click to enter edit mode
  const handleDoubleClick = () => {
    handleEdit();
  };

  const handleSave = () => {
    try {
      // Parse start time
      const [startDatePart, startTimePart] = editStartTime.split('T');
      const [startYear, startMonth, startDay] = startDatePart.split('-').map(Number);
      const [startHour, startMinute, startSecond] = startTimePart.split(':').map(Number);
      
      // Create a PlainDateTime in Zurich timezone
      const startPlainDateTime = Temporal.PlainDateTime.from({
        year: startYear, month: startMonth, day: startDay, 
        hour: startHour, minute: startMinute, second: startSecond
      });
      
      const newStartTime = zurichPlainDateTimeToTimestamp(startPlainDateTime);
      
      let newEndTime = 0;
      if (editEndTime) {
        // Parse end time
        const [endDatePart, endTimePart] = editEndTime.split('T');
        const [endYear, endMonth, endDay] = endDatePart.split('-').map(Number);
        const [endHour, endMinute, endSecond] = endTimePart.split(':').map(Number);
        
        // Create a PlainDateTime in Zurich timezone
        const endPlainDateTime = Temporal.PlainDateTime.from({
          year: endYear, month: endMonth, day: endDay, 
          hour: endHour, minute: endMinute, second: endSecond
        });
        
        newEndTime = zurichPlainDateTimeToTimestamp(endPlainDateTime);
      }
      
      onUpdate(entry.taskId, entry.index, { startTime: newStartTime, endTime: newEndTime });
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating time entry:', error);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleDelete = () => {
    onDelete(entry.taskId, entry.index);
  };

  if (isEditing) {
    return (
      <TableRow>
        <TableCell>{entry.taskTitle}</TableCell>
        <TableCell>{entry.taskCategory || "Uncategorized"}</TableCell>
        <TableCell>
          <Input
            type="datetime-local"
            step="1"
            value={editStartTime}
            onChange={(e) => setEditStartTime(e.target.value)}
          />
        </TableCell>
        <TableCell>
          <Input
            type="datetime-local"
            step="1"
            value={editEndTime}
            onChange={(e) => setEditEndTime(e.target.value)}
          />
        </TableCell>
        <TableCell className="flex gap-2">
          <Button size="sm" onClick={handleSave}>Save</Button>
          <Button size="sm" variant="outline" onClick={handleCancel}>Cancel</Button>
        </TableCell>
      </TableRow>
    );
  }

  // Calculate indent level for nested tasks
  const task = taskMap[entry.taskId];
  let indentLevel = 0;
  let current = taskMap[entry.taskId];
  const topParentId = entry.taskParentId || entry.taskId;
  
  while (current && current.id !== topParentId) {
    if (current.parentId) {
      indentLevel++;
      current = taskMap[current.parentId];
    } else {
      break;
    }
  }

  return (
    <TableRow 
      className="hover:bg-muted/50"
      onDoubleClick={handleDoubleClick}
    >
      <TableCell style={{ paddingLeft: indentLevel > 0 ? `${Math.min(8 + indentLevel * 4, 20)}px` : undefined }}>
        <div className="flex items-center gap-2">
          {indentLevel > 0 && <span className="text-muted-foreground">↳ </span>}
          {entry.taskTitle}
          <TaskTag 
            impact={task?.impact} 
            urgent={task?.urgent} 
            majorIncident={task?.majorIncident} 
          />
        </div>
      </TableCell>
      <TableCell>{entry.taskCategory || "Uncategorized"}</TableCell>
      <TableCell>{formatTimeWithTemporal(entry.startTime)}</TableCell>
      <TableCell>{entry.endTime > 0 ? formatTimeWithTemporal(entry.endTime) : 'Running'}</TableCell>
      <TableCell className="flex items-center justify-between">
        <span>{formatDuration(duration)}</span>
        <div className="flex gap-1">
          {onJumpToTask && (
            <Button 
              size="sm" 
              variant="outline" 
              className="h-6 w-6 p-0"
              onClick={() => onJumpToTask(entry.taskId)}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          <Button 
            size="sm" 
            variant="outline" 
            className="h-6 w-6 p-0"
            onClick={handleEdit}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button 
            size="sm" 
            variant="destructive" 
            className="h-6 w-6 p-0"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
};

export const Timetable: React.FC<{
  onJumpToTask?: (taskId: string) => void;
}> = ({ onJumpToTask }) => {
  const navigate = useNavigate();
  const { tasks, updateTimeEntry, deleteTimeEntry } = useTasks();

  // Create a map of task IDs to task objects for easy lookup
  const taskMap = React.useMemo(() => {
    return tasks.reduce((acc, task) => {
      acc[task.id] = task;
      return acc;
    }, {} as Record<string, typeof tasks[0]>);
  }, [tasks]);
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([]);
  const [dateRange, setDateRange] = useState<{ start?: Date; end?: Date }>({});
  const [predefinedRange, setPredefinedRange] = useState<string | null>(null);

  // Get date range based on predefined selection
  const getDateRange = () => {
    // Get current time in Zurich timezone
    const zurichNow = Temporal.Now.zonedDateTimeISO('Europe/Zurich');
    const today = Temporal.PlainDate.from({
      year: zurichNow.year,
      month: zurichNow.month,
      day: zurichNow.day
    }).toZonedDateTime('Europe/Zurich');
    
    switch (predefinedRange) {
      case "today": {
        const endOfDay = today.add({ days: 1 }).subtract({ nanoseconds: 1 });
        return { 
          start: new Date(today.epochMilliseconds), 
          end: new Date(endOfDay.epochMilliseconds) 
        };
      }
      case "yesterday": {
        const yesterday = today.subtract({ days: 1 });
        const endOfYesterday = yesterday.add({ days: 1 }).subtract({ nanoseconds: 1 });
        return { 
          start: new Date(yesterday.epochMilliseconds), 
          end: new Date(endOfYesterday.epochMilliseconds) 
        };
      }
      case "thisWeek": {
        // Get start of week (Sunday)
        const daysToSubtract = today.dayOfWeek === 7 ? 0 : today.dayOfWeek;
        const startOfWeek = today.subtract({ days: daysToSubtract }).with({
          hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0
        });
        const endOfWeek = startOfWeek.add({ days: 6 }).with({
          hour: 23, minute: 59, second: 59, millisecond: 999
        });
        return { 
          start: new Date(startOfWeek.epochMilliseconds), 
          end: new Date(endOfWeek.epochMilliseconds) 
        };
      }
      case "lastWeek": {
        // Get start of last week
        const daysToSubtract = today.dayOfWeek === 7 ? 7 : (today.dayOfWeek + 7);
        const startOfLastWeek = today.subtract({ days: daysToSubtract }).with({
          hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0
        });
        const endOfLastWeek = startOfLastWeek.add({ days: 6 }).with({
          hour: 23, minute: 59, second: 59, millisecond: 999
        });
        return { 
          start: new Date(startOfLastWeek.epochMilliseconds), 
          end: new Date(endOfLastWeek.epochMilliseconds) 
        };
      }
      case "thisMonth": {
        const startOfMonth = today.with({
          day: 1, hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0
        });
        const endOfMonth = startOfMonth.add({ months: 1 }).subtract({ days: 1 }).with({
          hour: 23, minute: 59, second: 59, millisecond: 999
        });
        return { 
          start: new Date(startOfMonth.epochMilliseconds), 
          end: new Date(endOfMonth.epochMilliseconds) 
        };
      }
      case "lastMonth": {
        const startOfThisMonth = today.with({ day: 1, hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });
        const startOfLastMonth = startOfThisMonth.subtract({ months: 1 });
        const endOfLastMonth = startOfThisMonth.subtract({ days: 1 }).with({ hour: 23, minute: 59, second: 59, millisecond: 999 });
        return {
          start: new Date(startOfLastMonth.epochMilliseconds),
          end: new Date(endOfLastMonth.epochMilliseconds)
        };
      }
      case "ytd": {
        const startOfYear = today.with({
          month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0
        });
        return {
          start: new Date(startOfYear.epochMilliseconds),
          end: new Date(today.epochMilliseconds)
        };
      }
      default:
        return { start: dateRange.start, end: dateRange.end };
    }
  };

  // Filter tasks by category
  const filteredTasks = tasks.filter((task) => {
    // If no categories are selected, show all tasks
    if (selectedCategories.length === 0) return true;
    
    // If task has a category, check if it's in the selected categories
    if (task.category) {
      return selectedCategories.includes(task.category);
    }
    
    // If task has no category, check if "Uncategorized" is selected
    return selectedCategories.includes("Uncategorized" as any);
  });

  // Get all timer entries with task information
  const timerEntries = filteredTasks
    .filter((task) => task.timer && task.timer.length > 0)
    .flatMap((task) =>
      task.timer?.map((timerEntry, index) => ({
        ...timerEntry,
        taskId: task.id,
        taskTitle: task.title,
        taskCategory: task.category,
        taskParentId: task.parentId,
        index,
      })) || []
    )
    .filter((entry) => {
      // Filter by date range
      const range = getDateRange();
      
      // If no date range is selected, show all entries
      if (!range.start && !range.end) {
        return true;
      }
      
      // Convert entry times to Zurich timezone for comparison
      const entryStartZurich = Temporal.Instant.fromEpochMilliseconds(entry.startTime)
        .toZonedDateTimeISO('Europe/Zurich');
      const entryEndZurich = entry.endTime > 0 
        ? Temporal.Instant.fromEpochMilliseconds(entry.endTime).toZonedDateTimeISO('Europe/Zurich')
        : Temporal.Now.zonedDateTimeISO('Europe/Zurich');
      
      // Convert range times to Zurich timezone for comparison
      const rangeStartZurich = range.start 
        ? Temporal.Instant.fromEpochMilliseconds(range.start.getTime()).toZonedDateTimeISO('Europe/Zurich')
        : null;
      const rangeEndZurich = range.end 
        ? Temporal.Instant.fromEpochMilliseconds(range.end.getTime()).toZonedDateTimeISO('Europe/Zurich')
        : null;
      
      // Check if the timer entry overlaps with the selected date range
      if (rangeStartZurich && entryEndZurich.epochNanoseconds < rangeStartZurich.epochNanoseconds) {
        return false;
      }
      if (rangeEndZurich && entryStartZurich.epochNanoseconds > rangeEndZurich.epochNanoseconds) {
        return false;
      }
      return true;
    });

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  };

  // Calculate total time spent
  const totalTime = timerEntries.reduce((acc, entry) => acc + (entry.endTime > 0 ? entry.endTime - entry.startTime : Date.now() - entry.startTime), 0);

  // Group entries by category for summary
  const entriesByCategory = timerEntries.reduce((acc, entry) => {
    const category = entry.taskCategory || "Uncategorized";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(entry);
    return acc;
  }, {} as Record<string, typeof timerEntries>);

  const categoryTotals = Object.entries(entriesByCategory).map(([category, entries]) => ({
    category,
    totalTime: entries.reduce((acc, entry) => acc + (entry.endTime > 0 ? entry.endTime - entry.startTime : Date.now() - entry.startTime), 0),
  }));

  // Group entries by top-level parent task for detailed view
  const entriesByTopParentTask = timerEntries.reduce((acc, entry) => {
    // Find the top-level parent task
    let topLevelParentId = entry.taskId;
    let currentTask = taskMap[entry.taskId];
    
    // Traverse up the hierarchy to find the top-level parent
    while (currentTask && currentTask.parentId) {
      topLevelParentId = currentTask.parentId;
      currentTask = taskMap[currentTask.parentId];
    }
    
    if (!acc[topLevelParentId]) {
      acc[topLevelParentId] = [];
    }
    acc[topLevelParentId].push(entry);
    return acc;
  }, {} as Record<string, typeof timerEntries>);


  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Timetable</h1>
      
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex flex-col space-y-2">
          <label className="text-sm font-medium">Categories</label>
          <div className="flex flex-wrap gap-2">
            <CategorySelect
              value="none"
              onChange={(category) => {
                if (category && category !== "none" && !selectedCategories.includes(category)) {
                  setSelectedCategories([...selectedCategories, category]);
                } else if (category === "none" && !selectedCategories.includes("Uncategorized" as any)) {
                  // Handle "No category" selection
                  setSelectedCategories([...selectedCategories, "Uncategorized" as any]);
                }
              }}
              className="w-48"
            />
            <div className="flex flex-wrap gap-1">
              {selectedCategories.map((category) => (
                <div key={category} className="bg-secondary rounded-md px-2 py-1 text-sm flex items-center">
                  {category}
                  <button
                    onClick={() => setSelectedCategories(selectedCategories.filter((c) => c !== category))}
                    className="ml-1 text-muted-foreground hover:text-foreground"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="flex flex-col space-y-2">
          <label className="text-sm font-medium">Date Range</label>
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-48 justify-start text-left font-normal",
                    !dateRange.start && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange.start ? format(dateRange.start, "PPP") : "Start date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={dateRange.start}
                  onSelect={(date) => setDateRange({ ...dateRange, start: date })}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-48 justify-start text-left font-normal",
                    !dateRange.end && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange.end ? format(dateRange.end, "PPP") : "End date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={dateRange.end}
                  onSelect={(date) => setDateRange({ ...dateRange, end: date })}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        
        <div className="flex flex-col space-y-2">
          <label className="text-sm font-medium">Predefined Ranges</label>
          <div className="flex flex-wrap gap-2">
            {PREDEFINED_RANGES.map((range) => (
              <Button
                key={range.value}
                variant={predefinedRange === range.value ? "default" : "outline"}
                size="sm"
                onClick={() => setPredefinedRange(range.value)}
              >
                {range.label}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDateRange({});
                setPredefinedRange(null);
              }}
            >
              Clear
            </Button>
          </div>
        </div>
      </div>
      
      {/* Summary by category */}
      <div className="mt-4">
        <h2 className="text-lg font-semibold mb-2">Time Summary by Category</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Total Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categoryTotals.map(({ category, totalTime }) => (
              <TableRow key={category}>
                <TableCell>{category}</TableCell>
                <TableCell>{formatDuration(totalTime)}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-bold">Total</TableCell>
              <TableCell className="font-bold">{formatDuration(totalTime)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      
      {/* Detailed timetable */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-2">Detailed Timetable</h2>
        {timerEntries.length === 0 ? (
          <p>No timer data matches the selected filters.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Start Time</TableHead>
                <TableHead>End Time</TableHead>
                <TableHead>Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(entriesByTopParentTask).map(([topParentId, entries]) => {
                // Calculate grand total for this top parent task group
                const groupTotal = entries.reduce((acc, entry) => 
                  acc + (entry.endTime > 0 ? entry.endTime - entry.startTime : Date.now() - entry.startTime), 0);
                
                // Get top parent task info
                const topParentTask = taskMap[topParentId];
                
                // Group entries by their immediate parent for proper nesting
                const entriesByImmediateParent = entries.reduce((acc, entry) => {
                  // The immediate parent for grouping is either the task's actual parent, or the task itself if it's a top-level task in this group
                  const immediateParentId = entry.taskParentId || entry.taskId;
                  
                  if (!acc[immediateParentId]) {
                    acc[immediateParentId] = [];
                  }
                  acc[immediateParentId].push(entry);
                  return acc;
                }, {} as Record<string, typeof entries>);
                
                return (
                  <React.Fragment key={topParentId}>
                    {/* Top parent task row with grand total */}
                    <TableRow className="bg-muted">
                      <TableCell className="font-bold">
                        <div className="flex items-center gap-2">
                          {topParentTask?.title || "Unknown Task"} (Grand Total)
                          <TaskTag 
                            impact={topParentTask?.impact} 
                            urgent={topParentTask?.urgent} 
                            majorIncident={topParentTask?.majorIncident} 
                          />
                        </div>
                      </TableCell>
                      <TableCell colSpan={3}></TableCell>
                      <TableCell className="font-bold">{formatDuration(groupTotal)}</TableCell>
                    </TableRow>
                    
                    {/* Individual entries grouped by immediate parent */}
                    {Object.entries(entriesByImmediateParent).map(([parentId, parentEntries]) => {
                      // If this is not the top parent, show it as a subtask group
                      const parentTask = taskMap[parentId];
                      const isSubtaskGroup = parentId !== topParentId;
                      
                      return (
                        <React.Fragment key={parentId}>
                          {/* Subtask group header */}
                          {isSubtaskGroup && parentTask && (
                            <TableRow className="bg-secondary/50">
                              <TableCell className="pl-6 font-medium">
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground">↳ </span>
                                  {parentTask.title}
                                  <TaskTag 
                                    impact={parentTask.impact} 
                                    urgent={parentTask.urgent} 
                                    majorIncident={parentTask.majorIncident} 
                                  />
                                </div>
                              </TableCell>
                              <TableCell colSpan={3}></TableCell>
                              <TableCell className="font-medium">
                                {formatDuration(parentEntries.reduce((acc, entry) => 
                                  acc + (entry.endTime > 0 ? entry.endTime - entry.startTime : Date.now() - entry.startTime), 0))}
                              </TableCell>
                            </TableRow>
                          )}
                          
                          {/* Individual entries */}
                          {parentEntries.map((entry) => (
                            <EditableTimeEntry
                              key={`${entry.taskId}-${entry.index}`}
                              entry={entry}
                              taskMap={taskMap}
                              onUpdate={updateTimeEntry}
                              onDelete={deleteTimeEntry}
                              onJumpToTask={onJumpToTask}
                            />
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};