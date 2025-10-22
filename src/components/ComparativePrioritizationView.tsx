import React, { useState, useEffect } from 'react';
import { Task } from '@/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';

interface ComparativePrioritizationViewProps {
  tasks: Task[];
  onUpdatePriorities: (updatedTasks: { id: string; priority: number }[]) => void;
  onClose: () => void; // To allow closing or switching back to the main view
}

interface ComparisonResult {
  taskId: string;
  score: number;
}

const ComparativePrioritizationView: React.FC<ComparativePrioritizationViewProps> = ({
  tasks,
  onUpdatePriorities,
  onClose,
}) => {
  const [selectedTasks, setSelectedTasks] = useState<Task[]>([]);
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
  const topLevelTasks = tasks.filter(task => !task.parentId); // Filter for top-level tasks

  // Initialize selected tasks with all non-done, non-dropped top-level tasks
  useEffect(() => {
    setSelectedTasks(topLevelTasks);
  }, []);

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
      // Assign priorities based on rank (higher score = higher priority)
      // Max priority is the number of tasks, lowest is 1
      const updatedPriorities = prioritizedResults.map((result, index) => ({
        id: result.taskId,
        priority: prioritizedResults.length - index,
      }));
      onUpdatePriorities(updatedPriorities);
      onClose(); // Close the view after applying
    }
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
          <>
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">Select Tasks for Comparison:</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-2">
                {topLevelTasks.map((task) => (
                  <div key={task.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`task-${task.id}`}
                      checked={selectedTasks.some(t => t.id === task.id)}
                      onCheckedChange={(checked) => handleTaskSelection(task, !!checked)}
                    />
                    <label
                      htmlFor={`task-${task.id}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {task.title}
                    </label>
                  </div>
                ))}
              </div>
              <Button onClick={startComparison} className="mt-4" disabled={selectedTasks.length < 2}>
                Start Comparative Prioritization ({selectedTasks.length} tasks selected)
              </Button>
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
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ComparativePrioritizationView;