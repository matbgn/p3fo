/**
 * @file ComparativePrioritizationView
 *
 * ## Architecture
 *
 * This component provides the UI for the Plackett-Luce + Swiss InfoGain
 * adaptive prioritization engine (see `@/lib/pl-prioritization`). The user
 * selects tasks, chooses a batch size K (2-5), and the engine adaptively
 * selects which K tasks to compare per batch based on current score
 * uncertainty (maximum information gain).
 *
 * ## Batch UI flow
 *
 * - **K=2 (pairwise)**: Two task buttons side by side. One click picks the
 *   highest; the other is implicitly the lowest. One click per batch.
 *
 * - **K>2 (batch)**: Two-step flow. First, "Pick the highest priority task"
 *   — all K buttons enabled. Then, "Now pick the lowest priority task" —
 *   the previously-chosen highest is disabled, remaining K-1 are enabled.
 *   Two clicks per batch, but each batch yields 2K-3 implicit pairwise wins.
 *
 * ## Stop conditions
 *
 * The engine stops when confident (all pairs resolved at BT p >= 0.75), or
 * when the ranking stabilizes, or when no informative batch remains. Results
 * are then shown and can be applied via `updatePrioritiesBulk`.
 *
 * ## Key interactions
 *
 * - `startComparison`: initializes the engine and shows the first batch.
 * - `resetComparison`: interrupts the current flow and clears all state.
 * - `handleBatchHighest` / `handleBatchLowest`: record the user's choice,
 *   advance the engine, and show the next batch or finalize results.
 * - `applyPriorities`: maps the engine's ranking to task priorities and
 *   persists them, preserving the relative order of non-selected tasks.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Task, useTasks } from '@/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CircleDot, Flame, Crosshair, Trash2 } from 'lucide-react';
import { saveFiltersToSessionStorage, loadFiltersFromSessionStorage } from "@/lib/filter-storage";
import { getDefaultFilters, validateFilters } from "@/lib/filter-merge";
import { Filters } from "./FilterControls";
import {
  initState,
  selectNextBatch,
  recordBatch,
  rankResults,
  expectedComparisons,
  confidencePercent,
  type PrioritizationState,
  type ComparisonBatch,
  type PLTask,
  type RankedTask,
} from '@/lib/pl-prioritization';

interface ComparativePrioritizationViewProps {
  tasks: Task[];
  onClose: () => void;
}

const ComparativePrioritizationView: React.FC<ComparativePrioritizationViewProps> = ({
  tasks,
  onClose,
}) => {
  const { updatePrioritiesBulk, deleteTask } = useTasks();

  const [filters, setFilters] = useState<Filters>(getDefaultFilters());

  // Load filters on mount
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const storedFilters = await loadFiltersFromSessionStorage();
        if (storedFilters) {
          setFilters(validateFilters(storedFilters));
        } else {
          setFilters(getDefaultFilters());
        }
      } catch (error) {
        console.error("Error loading filters:", error);
      }
    };

    loadFilters();
  }, []);

  const [selectedTasks, setSelectedTasks] = useState<Task[]>([]);
  const [filterUrgent, setFilterUrgent] = useState<boolean | null>(null); // null = all, true = only urgent, false = exclude urgent
  const [filterImpact, setFilterImpact] = useState<boolean | null>(null); // null = all, true = only impact, false = exclude impact
  const [filterIncident, setFilterIncident] = useState<boolean | null>(null); // null = all, true = only incident, false = exclude incident
  const [filterSprintTarget, setFilterSprintTarget] = useState<boolean | null>(null); // null = all, true = only sprint target, false = exclude sprint target
  const [batchSize, setBatchSize] = useState(2);
  const [prioritizationState, setPrioritizationState] = useState<PrioritizationState | null>(null);
  const [currentBatch, setCurrentBatch] = useState<ComparisonBatch | null>(null);
  const [batchPhase, setBatchPhase] = useState<'highest' | 'lowest'>('highest');
  const [selectedHighestId, setSelectedHighestId] = useState<string | null>(null);
  const [prioritizedResults, setPrioritizedResults] = useState<RankedTask[] | null>(null);
  const [deleteHovered, setDeleteHovered] = useState(false);
  const deleteHoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDeleteMouseEnter = React.useCallback(() => {
    deleteHoverTimerRef.current = setTimeout(() => setDeleteHovered(true), 500);
  }, []);

  const handleDeleteMouseLeave = React.useCallback(() => {
    if (deleteHoverTimerRef.current) {
      clearTimeout(deleteHoverTimerRef.current);
      deleteHoverTimerRef.current = null;
    }
    setDeleteHovered(false);
  }, []);
  const [initialTaskPriorities, setInitialTaskPriorities] = useState<Record<string, number | undefined>>({});
  const topLevelTasks = useMemo(() => tasks.filter(task => !task.parentId), [tasks]);

  // Effect to update session storage when filters change
  useEffect(() => {
    // Skip if filters haven't loaded yet
    if (filterUrgent === null && filterImpact === null && filterIncident === null && filterSprintTarget === null) return;
    
    const newFilters: Filters = {
      ...getDefaultFilters(),
      ...filters,
      showUrgent: filterUrgent === null ? false : filterUrgent,
      showImpact: filterImpact === null ? false : filterImpact,
      showMajorIncident: filterIncident === null ? false : filterIncident,
      showSprintTarget: filterSprintTarget === null ? false : filterSprintTarget,
    };
    setFilters(newFilters);
    saveFiltersToSessionStorage(newFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterUrgent, filterImpact, filterIncident, filterSprintTarget]);

  // Prune selected tasks when criticity filters change
  useEffect(() => {
    setSelectedTasks(prev => prev.filter(task => {
      if (filterUrgent !== null && task.urgent !== filterUrgent) return false;
      if (filterImpact !== null && task.impact !== filterImpact) return false;
      if (filterIncident !== null && task.majorIncident !== filterIncident) return false;
      if (filterSprintTarget !== null && task.sprintTarget !== filterSprintTarget) return false;
      return true;
    }));
  }, [filterUrgent, filterImpact, filterIncident, filterSprintTarget]);

  useEffect(() => {
    setSelectedTasks(topLevelTasks.filter(task => task.triageStatus !== "Done" && task.triageStatus !== "Dropped"));
    setInitialTaskPriorities(Object.fromEntries(tasks.map(task => [task.id, task.priority])));
  }, [tasks, topLevelTasks]);

  // Filter tasks based on urgency, impact, and incident state
  const filterTasks = (tasks: Task[]): Task[] => {
    return tasks.filter(task => {
      // Apply urgent filter
      if (filterUrgent !== null && task.urgent !== filterUrgent) {
        return false;
      }

      // Apply impact filter
      if (filterImpact !== null && task.impact !== filterImpact) {
        return false;
      }

      // Apply incident filter
      if (filterIncident !== null && task.majorIncident !== filterIncident) {
        return false;
      }

      // Apply sprint target filter
      if (filterSprintTarget !== null && task.sprintTarget !== filterSprintTarget) {
        return false;
      }

      return true;
    });
  };

  // Get filtered top-level tasks
  const filteredTopLevelTasks = filterTasks(topLevelTasks);

  const handleTaskSelection = (task: Task, isSelected: boolean) => {
    if (isSelected) {
      setSelectedTasks((prev) => [...prev, task]);
    } else {
      setSelectedTasks((prev) => prev.filter((t) => t.id !== task.id));
    }
    // Reset prioritization if selection changes
    setPrioritizedResults(null);
    setPrioritizationState(null);
    setCurrentBatch(null);
    setBatchPhase('highest');
    setSelectedHighestId(null);
  };

  const startComparison = () => {
    if (selectedTasks.length < 2) {
      alert('Please select at least two tasks to compare.');
      return;
    }

    const plTasks: PLTask[] = selectedTasks.map((t) => ({ id: t.id, title: t.title }));
    const state = initState(plTasks, batchSize);
    setPrioritizationState(state);
    setPrioritizedResults(null);
    setBatchPhase('highest');
    setSelectedHighestId(null);

    const firstBatch = selectNextBatch(state);
    setCurrentBatch(firstBatch);
  };

  const resetComparison = () => {
    setPrioritizationState(null);
    setCurrentBatch(null);
    setBatchPhase('highest');
    setSelectedHighestId(null);
    setPrioritizedResults(null);
  };

  const handleBatchHighest = (highestId: string) => {
    if (!prioritizationState || !currentBatch) return;
    const k = currentBatch.k;
    if (k === 2) {
      const batchIds = currentBatch.tasks.map((t) => t.id);
      const lowestId = batchIds.find((id) => id !== highestId);
      const next = recordBatch(prioritizationState, highestId, undefined, batchIds);
      setPrioritizationState(next);
      if (next.done && next.results) {
        setPrioritizedResults(next.results);
        setCurrentBatch(null);
      } else {
        const batch = selectNextBatch(next);
        setCurrentBatch(batch);
        setBatchPhase('highest');
        setSelectedHighestId(null);
      }
    } else {
      setSelectedHighestId(highestId);
      setBatchPhase('lowest');
    }
  };

  const handleBatchLowest = (lowestId: string) => {
    if (!prioritizationState || !currentBatch || !selectedHighestId) return;
    const batchIds = currentBatch.tasks.map((t) => t.id);
    const next = recordBatch(prioritizationState, selectedHighestId, lowestId, batchIds);
    setPrioritizationState(next);
    if (next.done && next.results) {
      setPrioritizedResults(next.results);
      setCurrentBatch(null);
    } else {
      const batch = selectNextBatch(next);
      setCurrentBatch(batch);
      setBatchPhase('highest');
      setSelectedHighestId(null);
    }
  };

  const applyPriorities = () => {
    if (prioritizedResults) {
      // Create a map for quick lookup of all tasks by ID
      const allTasksMap = new Map<string, Task>();
      tasks.forEach(task => allTasksMap.set(task.id, task));

      // Get the original full list of tasks, sorted by their current priority.
      // This maintains the relative order of tasks not involved in comparison.
      const originalSortedTasks = [...tasks].sort((a, b) => (a.priority || Infinity) - (b.priority || Infinity));

      // Create a set of IDs for tasks that were part of the comparison.
      const selectedTaskIds = new Set(prioritizedResults.map(result => result.taskId));

      // Create a list of the selected tasks, ordered according to their new priorities.
      const newOrderedSelectedTasks = prioritizedResults.map(result => allTasksMap.get(result.taskId)!);
      let currentSelectedTaskIndex = 0;

      // Build the final merged list of tasks.
      const finalMergedTasks: Task[] = [];
      for (const task of originalSortedTasks) {
        if (selectedTaskIds.has(task.id)) {
          // If this task was selected for comparison, insert the next task from the newly prioritized list
          finalMergedTasks.push(newOrderedSelectedTasks[currentSelectedTaskIndex]);
          currentSelectedTaskIndex++;
        } else {
          // If this task was not selected, keep it in its original relative position
          finalMergedTasks.push(task);
        }
      }

      // Assign new sequential priorities based on the final merged list.
      const updatedPriorities = finalMergedTasks.map((task, index) => ({
        id: task.id,
        priority: index + 1, // Priorities are 1-based
      }));

      updatePrioritiesBulk(updatedPriorities); // Use the bulk update function
      onClose(); // Close the view after applying
    }
  };

  const handleCopyTitlesToClipboard = () => {
    const titles = filteredTopLevelTasks.map(task => task.title).join('\n');
    navigator.clipboard.writeText(titles)
      .then(() => {
        alert('Task titles copied to clipboard!');
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
        alert('Failed to copy task titles to clipboard.');
      });
  };

  const handleDeleteSelected = () => {
    if (selectedTasks.length === 0) return;
    if (!window.confirm(`Delete ${selectedTasks.length} selected task${selectedTasks.length > 1 ? 's' : ''}? This cannot be undone.`)) return;
    selectedTasks.forEach((task) => deleteTask(task.id));
    setSelectedTasks([]);
    setPrioritizationState(null);
    setCurrentBatch(null);
    setBatchPhase('highest');
    setSelectedHighestId(null);
    setPrioritizedResults(null);
  };

  const progress = prioritizationState ? confidencePercent(prioritizationState) : 0;
  const comparisonCount = prioritizationState?.totalBatches ?? 0;

  return (
    <Card className="h-full flex flex-col border-0">
      <CardHeader>
        <CardTitle>Comparative Prioritization</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow overflow-auto p-4">
        {prioritizedResults ? (
          <div>
            <h3 className="text-lg font-semibold mb-2">Prioritization Results:</h3>
            <ul className="list-decimal pl-5 space-y-1">
              {prioritizedResults.map((result, index) => {
                const task = tasks.find(t => t.id === result.taskId);
                return (
                  <li key={task?.id} className="flex justify-between items-center py-1">
                    <span>{task?.title}</span>
                    <span className="font-medium text-blue-600">Score: {result.score}</span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 flex justify-end space-x-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={applyPriorities}>
                Apply New Priorities
              </Button>
            </div>
          </div>
        ) : (
          <React.Fragment>
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">Select Tasks for Comparison:</h3>

              {/* Filtering Controls */}
              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                <h4 className="text-sm font-medium mb-2">Filter by Criticity:</h4>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center space-x-2">
                    <label className="text-sm">Urgent:</label>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant={filterUrgent === null ? "default" : "outline"}
                        onClick={() => setFilterUrgent(null)}
                        className="text-xs"
                      >
                        All
                      </Button>
                      <Button
                        size="sm"
                        variant={filterUrgent === true ? "default" : "outline"}
                        onClick={() => setFilterUrgent(true)}
                        className="text-xs"
                      >
                        Yes
                      </Button>
                      <Button
                        size="sm"
                        variant={filterUrgent === false ? "default" : "outline"}
                        onClick={() => setFilterUrgent(false)}
                        className="text-xs"
                      >
                        No
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <label className="text-sm">High Impact:</label>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant={filterImpact === null ? "default" : "outline"}
                        onClick={() => setFilterImpact(null)}
                        className="text-xs"
                      >
                        All
                      </Button>
                      <Button
                        size="sm"
                        variant={filterImpact === true ? "default" : "outline"}
                        onClick={() => setFilterImpact(true)}
                        className="text-xs"
                      >
                        Yes
                      </Button>
                      <Button
                        size="sm"
                        variant={filterImpact === false ? "default" : "outline"}
                        onClick={() => setFilterImpact(false)}
                        className="text-xs"
                      >
                        No
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <label className="text-sm">Incident:</label>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant={filterIncident === null ? "default" : "outline"}
                        onClick={() => setFilterIncident(null)}
                        className="text-xs"
                      >
                        All
                      </Button>
                      <Button
                        size="sm"
                        variant={filterIncident === true ? "default" : "outline"}
                        onClick={() => setFilterIncident(true)}
                        className="text-xs"
                      >
                        Yes
                      </Button>
                      <Button
                        size="sm"
                        variant={filterIncident === false ? "default" : "outline"}
                        onClick={() => setFilterIncident(false)}
                        className="text-xs"
                      >
                        No
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <label className="text-sm">Sprint Target:</label>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant={filterSprintTarget === null ? "default" : "outline"}
                        onClick={() => setFilterSprintTarget(null)}
                        className="text-xs"
                      >
                        All
                      </Button>
                      <Button
                        size="sm"
                        variant={filterSprintTarget === true ? "default" : "outline"}
                        onClick={() => setFilterSprintTarget(true)}
                        className="text-xs"
                      >
                        Yes
                      </Button>
                      <Button
                        size="sm"
                        variant={filterSprintTarget === false ? "default" : "outline"}
                        onClick={() => setFilterSprintTarget(false)}
                        className="text-xs"
                      >
                        No
                      </Button>
                    </div>
                  </div>
                </div>

              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-2 mt-4">
                {filteredTopLevelTasks.map((task) => (
                  <div key={task.id} className="flex items-start space-x-2">
                    <Checkbox
                      id={`task-${task.id}`}
                      checked={selectedTasks.some(t => t.id === task.id)}
                      onCheckedChange={(checked) => handleTaskSelection(task, !!checked)}
                    />
                    <div className="flex-1 flex flex-wrap items-center gap-x-2">
                      <label
                        htmlFor={`task-${task.id}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {task.title}
                      </label>
                      {task.urgent && (
                        <Badge variant="destructive" className="text-xs py-0.5 px-1.5">
                          <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                          Urgent
                        </Badge>
                      )}
                      {task.impact && (
                        <Badge variant="secondary" className="text-xs py-0.5 px-1.5 bg-yellow-500 hover:bg-yellow-600 text-yellow-900">
                          <CircleDot className="h-2.5 w-2.5 mr-1" />
                          High Impact
                        </Badge>
                      )}
                      {task.majorIncident && (
                        <Badge variant="destructive" className="text-xs py-0.5 px-1.5 bg-red-700 hover:bg-red-800 text-white">
                          <Flame className="h-2.5 w-2.5 mr-1" />
                          Incident
                        </Badge>
                      )}
                      {task.sprintTarget && (
                        <Badge variant="secondary" className="text-xs py-0.5 px-1.5 bg-violet-500 hover:bg-violet-600 text-white">
                          <Crosshair className="h-2.5 w-2.5 mr-1" />
                          Sprint Target
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Items per batch:</span>
                  <div className="flex gap-1">
                    {[2, 3, 4, 5].map((k) => (
                      <Button
                        key={k}
                        size="sm"
                        variant={batchSize === k ? "default" : "outline"}
                        onClick={() => setBatchSize(k)}
                        disabled={k > selectedTasks.length}
                        className="text-xs w-9"
                      >
                        {k}
                      </Button>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Compare 2 at a time (take longer) or more at once (pick best then worst, faster as it uses Plackett-Luce algorithm).
                  </span>
                </div>
                <div className="flex space-x-2">
                  {currentBatch && !prioritizationState?.done ? (
                    <Button variant="destructive" onClick={() => {
                      if (window.confirm('Interrupt and reset the current comparison? All progress will be lost.')) {
                        resetComparison();
                      }
                    }}>
                      Reset Comparison
                    </Button>
                  ) : (
                    <Button onClick={startComparison} disabled={selectedTasks.length < 2}>
                      Start Comparative Prioritization ({selectedTasks.length} tasks, ~{expectedComparisons(selectedTasks.length, batchSize)} batches)
                    </Button>
                  )}
                  <Button variant="outline" onClick={handleCopyTitlesToClipboard} disabled={selectedTasks.length === 0}>
                    Copy List to Clipboard
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedTasks([])} disabled={selectedTasks.length === 0}>
                    Deselect All
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedTasks(filteredTopLevelTasks)} disabled={selectedTasks.length === filteredTopLevelTasks.length}>
                    Select All
                  </Button>
                  <div
                    onMouseEnter={handleDeleteMouseEnter}
                    onMouseLeave={handleDeleteMouseLeave}
                    className="inline-block"
                  >
                    <Button
                      variant="outline"
                      onClick={deleteHovered ? handleDeleteSelected : undefined}
                      disabled={selectedTasks.length === 0}
                      className={`text-destructive hover:text-destructive transition-opacity ${deleteHovered ? 'opacity-100' : 'opacity-50 cursor-not-allowed'}`}
                      title={deleteHovered ? 'Delete selected tasks' : 'Hover for 0.5s to enable deletion'}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete Selected ({selectedTasks.length})
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {currentBatch && (
              <div className="mt-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-700">
                <h3 className="text-lg font-semibold mb-4 text-center">
                  {currentBatch.k === 2
                    ? "Which one should be done first?"
                    : batchPhase === 'highest'
                      ? "Pick the highest priority task:"
                      : "Now pick the lowest priority task:"}
                </h3>
                <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-600 mb-4">
                  <div className="bg-blue-600 h-2.5 rounded-full transition-all" style={{ width: `${progress}%` }}></div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 text-center">
                  Batch {comparisonCount + 1} · {progress}% confident
                </p>
                <div className={`flex justify-around items-center gap-4 ${currentBatch.k > 2 ? 'flex-col' : ''}`}>
                  {currentBatch.tasks.map((task) => {
                    const isDisabled =
                      (batchPhase === 'lowest' && task.id === selectedHighestId) ||
                      (prioritizationState?.done ?? false);
                    const isHighlighted = batchPhase === 'lowest' && task.id === selectedHighestId;
                    return (
                      <Button
                        key={task.id}
                        variant={isHighlighted ? "default" : "outline"}
                        className="flex-1 h-auto py-4 text-lg text-wrap break-words w-full"
                        disabled={isDisabled}
                        onClick={() => {
                          if (currentBatch.k === 2 || batchPhase === 'highest') {
                            handleBatchHighest(task.id);
                          } else {
                            handleBatchLowest(task.id);
                          }
                        }}
                      >
                        {task.title}
                      </Button>
                    );
                  })}
                </div>
                {currentBatch.k === 2 && (
                  <p className="text-xs text-center text-muted-foreground mt-2">
                    Click the highest priority task — the other is automatically lowest.
                  </p>
                )}
                {currentBatch.k > 2 && batchPhase === 'lowest' && (
                  <p className="text-xs text-center text-muted-foreground mt-2">
                    The highest was already chosen. Now pick the lowest among the remaining.
                  </p>
                )}
              </div>
            )}
          </React.Fragment>
        )}
      </CardContent>
    </Card>
  );
};

export default ComparativePrioritizationView;