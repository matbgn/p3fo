import React, { useState, useEffect } from 'react';
import { Task, useTasks } from '@/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CircleDot, Flame } from 'lucide-react';
import { saveFiltersToSessionStorage, loadFiltersFromSessionStorage, clearFiltersFromSessionStorage } from "@/lib/filter-storage";
import { Filters } from "./FilterControls";

interface ComparativePrioritizationViewProps {
  tasks: Task[];
  onClose: () => void; // To allow closing or switching back to the main view
}

interface ComparisonResult {
  taskId: string;
  score: number;
}

const ComparativePrioritizationView: React.FC<ComparativePrioritizationViewProps> = ({
  tasks,
  onClose,
}) => {
  const { updatePrioritiesBulk } = useTasks(); // Use the new bulk update function
  const defaultComparativeFilters: Filters = {
    showUrgent: false,
    showImpact: false,
    showMajorIncident: false,
    showSprintTarget: false,
    status: [],
    searchText: "",
    difficulty: [],
    category: []
  };

  const [filters, setFilters] = useState<Filters>(defaultComparativeFilters);

  // Load filters on mount
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const storedFilters = await loadFiltersFromSessionStorage();
        if (storedFilters) {
          setFilters(storedFilters);
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
  const [comparisonState, setComparisonState] = useState<{
    leftTask: Task | null;
    rightTask: Task | null;
    currentIndex: number;
    comparisons: { [taskId: string]: number };
    pairs: [string, string][];
  }>({
    leftTask: null,
    rightTask: null,
    currentIndex: 0,
    comparisons: {},
    pairs: [],
  });
  const [prioritizedResults, setPrioritizedResults] = useState<ComparisonResult[] | null>(null);
  const [initialTaskPriorities, setInitialTaskPriorities] = useState<Record<string, number | undefined>>({});
  const topLevelTasks = tasks.filter(task => !task.parentId); // Filter for top-level tasks

  // Effect to update session storage when filters change
  useEffect(() => {
    const newFilters: Filters = {
      ...filters,
      showUrgent: filterUrgent === null ? false : filterUrgent,
      showImpact: filterImpact === null ? false : filterImpact,
      showMajorIncident: filterIncident === null ? false : filterIncident,
    };
    setFilters(newFilters);
    setFilters(newFilters);
    saveFiltersToSessionStorage(newFilters);
  }, [filterUrgent, filterImpact, filterIncident, filters]);

  // Initialize selected tasks with all non-done, non-dropped top-level tasks
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
    setComparisonState({
      leftTask: null,
      rightTask: null,
      currentIndex: 0,
      comparisons: {},
      pairs: [],
    });
  };

  const startComparison = () => {
    if (selectedTasks.length < 2) {
      alert('Please select at least two tasks to compare.');
      return;
    }

    const newPairs: [string, string][] = [];
    for (let i = 0; i < selectedTasks.length; i++) {
      for (let j = i + 1; j < selectedTasks.length; j++) {
        newPairs.push([selectedTasks[i].id, selectedTasks[j].id]);
      }
    }

    setComparisonState({
      leftTask: selectedTasks.find(t => t.id === newPairs[0][0]) || null,
      rightTask: selectedTasks.find(t => t.id === newPairs[0][1]) || null,
      currentIndex: 0,
      comparisons: Object.fromEntries(selectedTasks.map(task => [task.id, 0])),
      pairs: newPairs,
    });
    setPrioritizedResults(null);
  };

  const handleComparisonChoice = (winnerId: string) => {
    setComparisonState((prevState) => {
      const newComparisons = { ...prevState.comparisons };
      newComparisons[winnerId]++;

      const nextIndex = prevState.currentIndex + 1;
      if (nextIndex < prevState.pairs.length) {
        const [leftId, rightId] = prevState.pairs[nextIndex];
        return {
          ...prevState,
          currentIndex: nextIndex,
          leftTask: selectedTasks.find(t => t.id === leftId) || null,
          rightTask: selectedTasks.find(t => t.id === rightId) || null,
          comparisons: newComparisons,
        };
      } else {
        // All comparisons done, calculate results
        const results = Object.entries(newComparisons)
          .map(([taskId, score]) => ({ taskId, score }))
          .sort((a, b) => b.score - a.score); // Sort descending by score

        setPrioritizedResults(results);
        return { ...prevState, currentIndex: nextIndex, comparisons: newComparisons };
      }
    });
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

  const currentPair = comparisonState.pairs[comparisonState.currentIndex];
  const progress = selectedTasks.length > 1
    ? ((comparisonState.currentIndex) / comparisonState.pairs.length) * 100
    : 0;

  return (
    <Card className="h-full flex flex-col">
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
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex space-x-2">
                <Button onClick={startComparison} disabled={selectedTasks.length < 2}>
                  Start Comparative Prioritization ({selectedTasks.length} tasks selected)
                </Button>
                <Button variant="outline" onClick={handleCopyTitlesToClipboard} disabled={selectedTasks.length === 0}>
                  Copy List to Clipboard
                </Button>
                <Button variant="outline" onClick={() => setSelectedTasks([])} disabled={selectedTasks.length === 0}>
                  Deselect All
                </Button>
                <Button variant="outline" onClick={() => setSelectedTasks(filteredTopLevelTasks)} disabled={selectedTasks.length === filteredTopLevelTasks.length}>
                  Select All
                </Button>
              </div>
            </div>

            {comparisonState.leftTask && comparisonState.rightTask && (
              <div className="mt-6 p-4 border rounded-lg bg-gray-50 dark:bg-gray-700">
                <h3 className="text-lg font-semibold mb-4 text-center">Which is more important?</h3>
                <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-600 mb-4">
                  <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 text-center">
                  Comparison {comparisonState.currentIndex + 1} of {comparisonState.pairs.length}
                </p>
                <div className="flex justify-around items-center space-x-4">
                  <Button
                    variant="outline"
                    className="flex-1 h-auto py-4 text-lg text-wrap break-words"
                    onClick={() => handleComparisonChoice(comparisonState.leftTask!.id)}
                  >
                    {comparisonState.leftTask.title}
                  </Button>
                  <span className="text-xl font-bold">VS</span>
                  <Button
                    variant="outline"
                    className="flex-1 h-auto py-4 text-lg text-wrap break-words"
                    onClick={() => handleComparisonChoice(comparisonState.rightTask!.id)}
                  >
                    {comparisonState.rightTask.title}
                  </Button>
                </div>
              </div>
            )}
          </React.Fragment>
        )}
      </CardContent>
    </Card>
  );
};

export default ComparativePrioritizationView;