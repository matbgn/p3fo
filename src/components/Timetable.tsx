import React, { useState, useEffect } from "react";
import { useTasks, Category } from "@/hooks/useTasks";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CategorySelect } from "./CategorySelect";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Temporal } from '@js-temporal/polyfill';
import { useNavigate } from "react-router-dom";
import { TaskTag } from "./TaskTag";
import { ChronologicalView } from "./ChronologicalView";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EditableTimeEntry } from "./EditableTimeEntry";
import { formatDuration } from "@/lib/format-utils";
import { useCombinedSettings } from "@/hooks/useCombinedSettings";
import { UserFilterSelector } from "@/components/UserFilterSelector";

import { loadFiltersFromSessionStorage, saveFiltersToSessionStorage } from "@/lib/filter-storage";
import { Filters } from "@/components/FilterControls";
import { DateRangePicker } from "@/components/DateRangePicker";
import { DateRange } from "react-day-picker";

type TimetableView = "categorical" | "chronological";
type TimeChunk = "all" | "am" | "pm";

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
  const { tasks, updateTimeEntry, deleteTimeEntry, updateCategory, updateUser } = useTasks();
  const { settings } = useCombinedSettings();
  const weekStartsOn = settings.weekStartDay as 0 | 1;
  const [view, setView] = useState<TimetableView>("chronological");
  const [timeChunk, setTimeChunk] = useState<TimeChunk>("all");

  // Create a map of task IDs to task objects for easy lookup
  const taskMap = React.useMemo(() => {
    return tasks.reduce((acc, task) => {
      acc[task.id] = task;
      return acc;
    }, {} as Record<string, typeof tasks[0]>);
  }, [tasks]);

  const [selectedCategories, setSelectedCategories] = useState<Category[]>([]);
  const [dateRange, setDateRange] = useState<{ start?: Date; end?: Date }>({}); // Date range is not part of Filters type, managed separately
  const [predefinedRange, setPredefinedRange] = useState<string | null>("today"); // Predefined range is not part of Filters type, managed separately
  const [showUrgent, setShowUrgent] = useState(false);
  const [showImpact, setShowImpact] = useState(false);
  const [showMajorIncident, setShowMajorIncident] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Load filters from storage on mount
  useEffect(() => {
    const load = async () => {
      const filters = await loadFiltersFromSessionStorage();
      if (filters?.selectedUserId) {
        setSelectedUserId(filters.selectedUserId);
      }
    };
    load();
  }, []);

  // Helper to calculate date range for a given preset
  const calculateDateRange = React.useCallback((rangeValue: string) => {
    const timezoneNow = Temporal.Now.zonedDateTimeISO(settings.timezone || 'Europe/Zurich');
    const todayPlainDate = Temporal.PlainDate.from({
      year: timezoneNow.year,
      month: timezoneNow.month,
      day: timezoneNow.day
    });
    const todayZoned = todayPlainDate.toZonedDateTime(settings.timezone || 'Europe/Zurich');

    switch (rangeValue) {
      case "today": {
        const endOfDay = todayZoned.add({ days: 1 }).subtract({ nanoseconds: 1 });
        return {
          start: new Date(todayZoned.epochMilliseconds),
          end: new Date(endOfDay.epochMilliseconds)
        };
      }
      case "yesterday": {
        const yesterdayZoned = todayPlainDate.subtract({ days: 1 }).toZonedDateTime(settings.timezone || 'Europe/Zurich');
        const endOfYesterday = yesterdayZoned.add({ days: 1 }).subtract({ nanoseconds: 1 });
        return {
          start: new Date(yesterdayZoned.epochMilliseconds),
          end: new Date(endOfYesterday.epochMilliseconds)
        };
      }
      case "thisWeek": {
        const daysToSubtract = todayZoned.dayOfWeek === (weekStartsOn === 0 ? 7 : 1) ? 0 : (todayZoned.dayOfWeek - (weekStartsOn === 0 ? 0 : 1) + 7) % 7;
        // Actually, let's simplify using date-fns logic or just simple math
        // If weekStartsOn is 1 (Monday):
        // Sunday (7) -> subtract 6
        // Monday (1) -> subtract 0
        // ...
        // If weekStartsOn is 0 (Sunday):
        // Sunday (7) -> subtract 0
        // Monday (1) -> subtract 1

        // Let's rely on date-fns for this calculation to be consistent with DateRangePicker
        // But we are using Temporal here.
        // Let's stick to Temporal but correct logic.

        let daysToSub = 0;
        if (weekStartsOn === 1) { // Monday
          daysToSub = todayZoned.dayOfWeek === 7 ? 6 : todayZoned.dayOfWeek - 1;
        } else { // Sunday
          daysToSub = todayZoned.dayOfWeek === 7 ? 0 : todayZoned.dayOfWeek;
        }

        const startOfWeek = todayZoned.subtract({ days: daysToSub }).with({
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
        let daysToSub = 0;
        if (weekStartsOn === 1) { // Monday
          daysToSub = todayZoned.dayOfWeek === 7 ? 6 : todayZoned.dayOfWeek - 1;
        } else { // Sunday
          daysToSub = todayZoned.dayOfWeek === 7 ? 0 : todayZoned.dayOfWeek;
        }
        // Go to start of this week, then subtract 7 days
        const startOfLastWeek = todayZoned.subtract({ days: daysToSub + 7 }).with({
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
        const startOfMonth = todayZoned.with({
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
        const startOfThisMonth = todayZoned.with({ day: 1, hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });
        const startOfLastMonth = startOfThisMonth.subtract({ months: 1 });
        const endOfLastMonth = startOfThisMonth.subtract({ days: 1 }).with({ hour: 23, minute: 59, second: 59, millisecond: 999 });
        return {
          start: new Date(startOfLastMonth.epochMilliseconds),
          end: new Date(endOfLastMonth.epochMilliseconds)
        };
      }
      case "ytd": {
        const startOfYear = todayZoned.with({
          month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0
        });
        return {
          start: new Date(startOfYear.epochMilliseconds),
          end: new Date(todayZoned.epochMilliseconds)
        };
      }
      default:
        return { start: undefined, end: undefined };
    }
  }, [weekStartsOn]);

  // Initialize date range for "today" default
  useEffect(() => {
    // Only set if dateRange is empty (initial load) and predefinedRange is today
    if (!dateRange.start && !dateRange.end && predefinedRange === "today") {
      const range = calculateDateRange("today");
      setDateRange(range);
    }
  }, [dateRange.start, dateRange.end, predefinedRange, calculateDateRange]); // Run when dateRange or predefinedRange changes

  const handleUserChange = async (newUserId: string | null) => {
    setSelectedUserId(newUserId);
    const currentFilters = await loadFiltersFromSessionStorage() || {
      showUrgent: false,
      showImpact: false,
      showMajorIncident: false,
      status: [],
      showDone: false,
      searchText: "",
      difficulty: [],
      category: []
    } as Filters;

    await saveFiltersToSessionStorage({
      ...currentFilters,
      selectedUserId: newUserId
    });
  };

  // Handle date range change from DateRangePicker
  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDateRange({
      start: range?.from,
      end: range?.to
    });
    // Clear predefined range to rely on date comparison for isSingleDayRange
    setPredefinedRange(null);
  };

  const handlePredefinedRangeClick = (value: string) => {
    setPredefinedRange(value);
    const range = calculateDateRange(value);
    setDateRange(range);
  };

  // Helper to determine if the current range is a single day
  const isSingleDayRange = React.useCallback(() => {
    // If a predefined range is selected, check if it's 'today' or 'yesterday'
    if (predefinedRange === 'today' || predefinedRange === 'yesterday') {
      return true;
    }
    // If a custom range is selected, check if start and end dates are the same day
    if (dateRange.start && dateRange.end) {
      const start = new Date(dateRange.start);
      const end = new Date(dateRange.end);
      // Normalize dates to midnight for comparison
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      return start.getTime() === end.getTime();
    }
    return false;
  }, [dateRange, predefinedRange]);

  // Effect to reset timeChunk if the date range is no longer a single day
  React.useEffect(() => {
    if (!isSingleDayRange() && timeChunk !== "all") {
      setTimeChunk("all");
    }
  }, [isSingleDayRange, timeChunk]);

  // Filter tasks by category, urgency, impact, and major incident
  const filteredTasks = tasks.filter((task) => {
    // Category filter: if categories are selected, show tasks that either have no category
    // OR have a category that is included in the selected categories.
    if (selectedCategories.length > 0) {
      if (task.category) {
        if (!selectedCategories.includes(task.category)) return false;
      } else {
        // If task has no category, it should be shown if "Uncategorized" is selected
        // or if there are other categories selected (implying "show all" when no specific category is assigned)
        if (!selectedCategories.includes("Uncategorized" as Category) && selectedCategories.length > 0) {
          return false;
        }
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

    // User filter
    if (selectedUserId) {
      if (selectedUserId === 'UNASSIGNED') {
        if (task.userId && task.userId !== 'unassigned') return false;
      } else {
        if (task.userId !== selectedUserId) return false;
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
      // Date range filter
      const range = dateRange;
      if (range.start || range.end) {
        const entryStartTimezone = Temporal.Instant.fromEpochMilliseconds(entry.startTime).toZonedDateTimeISO(settings.timezone || 'Europe/Zurich');
        const rangeStartTimezone = range.start ? Temporal.Instant.fromEpochMilliseconds(range.start.getTime()).toZonedDateTimeISO(settings.timezone || 'Europe/Zurich') : null;
        const rangeEndTimezone = range.end ? Temporal.Instant.fromEpochMilliseconds(range.end.getTime()).toZonedDateTimeISO(settings.timezone || 'Europe/Zurich') : null;

        // Only check if the START time of the task falls within the range
        if (rangeStartTimezone && entryStartTimezone.epochNanoseconds < rangeStartTimezone.epochNanoseconds) return false;
        if (rangeEndTimezone && entryStartTimezone.epochNanoseconds > rangeEndTimezone.epochNanoseconds) return false;
      }

      // Time chunk filter
      if (isSingleDayRange() && timeChunk !== "all") {
        const [splitHour, splitMinute] = settings.splitTime.split(':').map(Number);
        const entryStart = Temporal.Instant.fromEpochMilliseconds(entry.startTime).toZonedDateTimeISO(settings.timezone || 'Europe/Zurich');

        if (timeChunk === "am") {
          if (entryStart.hour >= splitHour) return false;
        } else if (timeChunk === "pm") {
          if (entryStart.hour < splitHour) return false;
        }
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
          <label className="text-sm font-medium">Time period</label>
          <DateRangePicker
            date={{ from: dateRange.start, to: dateRange.end }}
            setDate={(range) => handleDateRangeChange(range)}
            weekStartsOn={weekStartsOn}
          />
        </div>

        <UserFilterSelector
          selectedUserId={selectedUserId}
          onUserChange={handleUserChange}
        />

        {isSingleDayRange() && (
          <div className="flex flex-col space-y-2">
            <label className="text-sm font-medium">Time Chunk</label>
            <ToggleGroup type="single" value={timeChunk} onValueChange={(value) => setTimeChunk(value as TimeChunk)} aria-label="Time Chunk">
              <ToggleGroupItem value="all" aria-label="All Day">
                All
              </ToggleGroupItem>
              <ToggleGroupItem value="am" aria-label="AM (before {settings.splitTime})">
                AM
              </ToggleGroupItem>
              <ToggleGroupItem value="pm" aria-label="PM (after {settings.splitTime})">
                PM
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}

        <div className="flex flex-col space-y-2">
          <label className="text-sm font-medium">Predefined Ranges</label>
          <div className="flex flex-wrap gap-2">
            {PREDEFINED_RANGES.map((range) => (
              <Button
                key={range.value}
                variant={predefinedRange === range.value ? "default" : "outline"}
                size="sm"
                onClick={() => handlePredefinedRangeClick(range.value)}
              >
                {range.label}
              </Button>
            ))}
          </div>
        </div>



        <div className="flex flex-col space-y-2">
          <label className="text-sm font-medium">Categories</label>
          <div className="flex flex-wrap gap-2">
            <CategorySelect
              value="none"
              onChange={(category) => {
                if (category && category !== "none" && !selectedCategories.includes(category)) {
                  setSelectedCategories([...selectedCategories, category]);
                } else if (category === "none" && !selectedCategories.includes("Uncategorized" as Category)) {
                  // Handle "No category" selection
                  setSelectedCategories([...selectedCategories, "Uncategorized" as Category]);
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

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setDateRange({});
            setPredefinedRange(null);
            setSelectedCategories([]);
            setShowUrgent(false);
            setShowImpact(false);
            setShowMajorIncident(false);
            setShowImpact(false);
            setShowMajorIncident(false);
            handleUserChange(null);
            setTimeChunk("all");
            // No need to clear from session storage for Timetable
          }}
        >
          Clear All Filters
        </Button>
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
                    <TableHead>User</TableHead>
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
                          <TableCell colSpan={4}></TableCell>
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
                                  <TableCell colSpan={4}></TableCell>
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
                                  onUpdateTimeEntry={updateTimeEntry}
                                  onUpdateTaskCategory={updateCategory}
                                  onUpdateUser={updateUser}
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
            onUpdateTimeEntry={updateTimeEntry}
            onUpdateTaskCategory={updateCategory}
            onUpdateUser={updateUser}
            onDelete={deleteTimeEntry}
            onJumpToTask={onJumpToTask}
          />
        )}
      </div>
    </div>
  );
};