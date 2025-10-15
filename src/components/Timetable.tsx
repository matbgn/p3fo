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
import { Calendar as CalendarIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Temporal } from '@js-temporal/polyfill';
import { useNavigate } from "react-router-dom";
import { TaskTag } from "./TaskTag";
import { ChronologicalView } from "./ChronologicalView";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EditableTimeEntry, formatDuration } from "./EditableTimeEntry";

type TimetableView = "categorical" | "chronological";

const PREDEFINED_RANGES = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "This Week", value: "thisWeek" },
  { label: "Last Week", value: "lastWeek" },
  { label: "This Month", value: "thisMonth" },
  { label: "Last Month", value: "lastMonth" },
  { label: "Year to Date", value: "ytd" },
];

export const Timetable: React.FC<{
  onJumpToTask?: (taskId: string) => void;
}> = ({ onJumpToTask }) => {
  const navigate = useNavigate();
  const { tasks, updateTimeEntry, deleteTimeEntry } = useTasks();
  const [view, setView] = useState<TimetableView>("categorical");

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
  const [showUrgent, setShowUrgent] = useState(false);
  const [showImpact, setShowImpact] = useState(false);
  const [showMajorIncident, setShowMajorIncident] = useState(false);

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

  // Filter tasks by category, urgency, impact, and major incident
  const filteredTasks = tasks.filter((task) => {
    // Category filter
    if (selectedCategories.length > 0) {
      if (task.category) {
        if (!selectedCategories.includes(task.category)) return false;
      } else {
        if (!selectedCategories.includes("Uncategorized" as any)) return false;
      }
    }

    // Urgent filter
    if (showUrgent) {
      let currentTaskForUrgent = task;
      let foundUrgentAncestor = false;
      while (currentTaskForUrgent) {
        if (currentTaskForUrgent.urgent) {
          foundUrgentAncestor = true;
          break;
        }
        if (currentTaskForUrgent.parentId) {
          currentTaskForUrgent = taskMap[currentTaskForUrgent.parentId];
        } else {
          break;
        }
      }
      if (!foundUrgentAncestor) {
        return false;
      }
    }

    // Impact filter
    if (showImpact) {
      let currentTaskForImpact = task;
      let foundImpactAncestor = false;
      while (currentTaskForImpact) {
        if (currentTaskForImpact.impact) {
          foundImpactAncestor = true;
          break;
        }
        if (currentTaskForImpact.parentId) {
          currentTaskForImpact = taskMap[currentTaskForImpact.parentId];
        } else {
          break;
        }
      }
      if (!foundImpactAncestor) {
        return false;
      }
    }

    // Incident on Delivery filter
    if (showMajorIncident) {
      let currentTaskForMajorIncident = task;
      let foundMajorIncidentAncestor = false;
      while (currentTaskForMajorIncident) {
        if (currentTaskForMajorIncident.majorIncident) {
          foundMajorIncidentAncestor = true;
          break;
        }
        if (currentTaskForMajorIncident.parentId) {
          currentTaskForMajorIncident = taskMap[currentTaskForMajorIncident.parentId];
        } else {
          break;
        }
      }
      if (!foundMajorIncidentAncestor) {
        return false;
      }
    }

    return true;
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
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Timetable</h1>
        <ToggleGroup type="single" value={view} onValueChange={(value) => setView(value as TimetableView)} aria-label="Timetable View">
          <ToggleGroupItem value="categorical" aria-label="Categorical View">
            Categorical
          </ToggleGroupItem>
          <ToggleGroupItem value="chronological" aria-label="Chronological View">
            Chronological
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      
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
                setShowUrgent(false);
                setShowImpact(false);
                setShowMajorIncident(false);
              }}
            >
              Clear
            </Button>
          </div>
        </div>

        <div className="flex flex-col space-y-2">
          <label className="text-sm font-medium">Criticity</label>
          <div className="flex flex-wrap gap-2">
            <Checkbox
              id="show-urgent"
              checked={showUrgent}
              onCheckedChange={(checked) => setShowUrgent(!!checked)}
            />
            <label htmlFor="show-urgent" className="text-sm font-medium">Urgent</label>

            <Checkbox
              id="show-impact"
              checked={showImpact}
              onCheckedChange={(checked) => setShowImpact(!!checked)}
            />
            <label htmlFor="show-impact" className="text-sm font-medium">High Impact</label>

            <Checkbox
              id="show-major-incident"
              checked={showMajorIncident}
              onCheckedChange={(checked) => setShowMajorIncident(!!checked)}
            />
            <label htmlFor="show-major-incident" className="text-sm font-medium">Incident on Delivery</label>
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
        {view === 'categorical' && (
          <div>
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
        )}
        {view === 'chronological' && (
          <ChronologicalView
            timerEntries={timerEntries}
            taskMap={taskMap}
            onUpdate={updateTimeEntry}
            onDelete={deleteTimeEntry}
            onJumpToTask={onJumpToTask}
          />
        )}
      </div>
    </div>
  );
};