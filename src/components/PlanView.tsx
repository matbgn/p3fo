import React, { useState, useRef, useEffect } from 'react';
import { useTasks, Task } from '@/hooks/useTasks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TaskCard } from './TaskCard'; // Import TaskCard
import ComparativePrioritizationView from './ComparativePrioritizationView'; // Import the new component
import { Button } from '@/components/ui/button'; // Import Button for view switching
import { Input } from '@/components/ui/input';
import { sortTasks } from '@/utils/taskSorting';
import { FilterControls, Filters } from "./FilterControls";
import { loadFiltersFromSessionStorage } from "@/lib/filter-storage";
import { QuickTimer } from "@/components/QuickTimer";

interface PlanViewProps {
  onFocusOnTask: (taskId: string) => void;
}

const PlanView: React.FC<PlanViewProps> = ({ onFocusOnTask }) => {
  const { tasks, updateStatus, updateDifficulty, updateCategory, updateTitle, updateUser, deleteTask, duplicateTaskStructure, toggleUrgent, toggleImpact, toggleMajorIncident, toggleDone, toggleTimer, reparent, updateTerminationDate, updateComment, updateDurationInMinutes, updatePriority, createTask } = useTasks();

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'storyboard' | 'prioritization'>('storyboard'); // New state for view switching

  // Track which parents are expanded in PlanView
  const [openParents, setOpenParents] = useState<Record<string, boolean>>({});

  const defaultPlanViewFilters: Filters = {
    showUrgent: false,
    showImpact: false,
    showMajorIncident: false,
    status: ["Backlog", "Ready", "WIP", "Blocked"], // All non-Done, non-Dropped statuses by default
    searchText: "",
    difficulty: [],
    category: []
  };

  const [filters, setFilters] = React.useState<Filters>(() => {
    const storedFilters = loadFiltersFromSessionStorage();
    return storedFilters || defaultPlanViewFilters;
  });

  // Quick add functionality
  const [input, setInput] = useState("");
  const addTopTask = () => {
    const v = input.trim();
    if (!v) return;
    createTask(v, null);
    setInput("");
  };

  const prioritizedTasks = React.useMemo(() => {
    return tasks
      .filter(task => !task.parentId && task.triageStatus !== 'Done' && task.triageStatus !== 'Dropped') // Filter for top-level tasks
      .filter(task => {
        // Apply search filter
        if (filters.searchText?.trim()) {
          const searchText = filters.searchText.toLowerCase();
          if (!task.title.toLowerCase().includes(searchText)) {
            return false;
          }
        }

        // Apply urgent filter
        if (filters.showUrgent && !task.urgent) {
          return false;
        }

        // Apply impact filter
        if (filters.showImpact && !task.impact) {
          return false;
        }

        // Apply major incident filter
        if (filters.showMajorIncident && !task.majorIncident) {
          return false;
        }

        // Apply difficulty filter
        if (filters.difficulty.length > 0 && !filters.difficulty.includes(task.difficulty)) {
          return false;
        }

        // Apply category filter
        if (filters.category.length > 0 && task.category && !filters.category.includes(task.category)) {
          return false;
        }

        // Apply status filter
        if (filters.status.length > 0 && !filters.status.includes(task.triageStatus)) {
          return false;
        }

        return true;
      })
      .sort(sortTasks.plan);
  }, [tasks, filters]); // Re-calculate when 'tasks' or 'filters' change

  // Get all children for a parent task (recursively)
  const getAllChildren = (task: Task): Task[] => {
    let children: Task[] = [];
    if (task.children) {
      for (const childId of task.children) {
        const child = tasks.find(t => t.id === childId);
        if (child) {
          children.push(child);
          children = children.concat(getAllChildren(child));
        }
      }
    }
    return children;
  };

  // Toggle parent expansion
  const toggleParent = (id: string) => {
    setOpenParents(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetTaskId: string) => {
    e.preventDefault();
    if (!draggedTaskId || draggedTaskId === targetTaskId) {
      return;
    }

    const draggedTask = tasks.find(task => task.id === draggedTaskId);
    const targetTask = tasks.find(task => task.id === targetTaskId);
    
    if (!draggedTask || !targetTask) return;

    // Get visible top-level tasks that are not Done or Dropped (same filter as prioritizedTasks)
    const visibleTopLevelTasks = tasks.filter(task => !task.parentId && task.triageStatus !== 'Done' && task.triageStatus !== 'Dropped');
    
    // Get the sorted order (this is what the user sees in the UI)
    const currentDisplayOrder = [...visibleTopLevelTasks].sort(sortTasks.plan);
    
    // Find positions in the display order (what the user sees)
    const draggedIndex = currentDisplayOrder.findIndex(task => task.id === draggedTaskId);
    const targetIndex = currentDisplayOrder.findIndex(task => task.id === targetTaskId);
    
    if (targetIndex === -1 && targetTaskId !== '') {
      // If target not found in display list but targetTaskId is not empty, return
      return;
    }

    let newDisplayOrder;
    if (targetTaskId === '') {
      // If dropped outside specific cards, add to the end
      newDisplayOrder = currentDisplayOrder.filter(task => task.id !== draggedTaskId);
      newDisplayOrder.push(draggedTask);
    } else if (targetIndex !== -1) {
      // Remove the dragged task from its current position and insert at target position
      newDisplayOrder = currentDisplayOrder.filter(task => task.id !== draggedTaskId);
      // Adjust target index if the dragged task was before the target in the original list
      const adjustedTargetIndex = targetIndex > draggedIndex ? targetIndex - 1 : targetIndex;
      newDisplayOrder.splice(adjustedTargetIndex, 0, draggedTask);
    } else {
      // Fallback: if target task not found, add to end
      newDisplayOrder = currentDisplayOrder.filter(task => task.id !== draggedTaskId);
      newDisplayOrder.push(draggedTask);
    }

    // Assign new priority values based on the new display order starting from 1
    newDisplayOrder.forEach((task, index) => {
      const newPriority = index + 1; // First task gets priority 1, second gets 2, etc.
      updatePriority(task.id, newPriority);
    });

    setDraggedTaskId(null);
  };


  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-col space-y-4 pb-2">
        <div className="flex flex-row items-center justify-between">
          <CardTitle>Plan View</CardTitle>
          <div className="flex space-x-2">
            <Button
              variant={activeView === 'storyboard' ? 'default' : 'outline'}
              onClick={() => setActiveView('storyboard')}
            >
              Storyboard
            </Button>
            <Button
              variant={activeView === 'prioritization' ? 'default' : 'outline'}
              onClick={() => setActiveView('prioritization')}
            >
              Prioritization
            </Button>
          </div>
        </div>
        <div className="mb-2 flex gap-2">
          <Input
            placeholder="Quick add top task..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTopTask()}
            className="max-w-md"
          />
          <Button onClick={addTopTask} disabled={!input.trim()}>
            Add
          </Button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-4 border rounded-lg p-3">
          <FilterControls
            filters={filters}
            setFilters={setFilters}
            defaultFilters={defaultPlanViewFilters}
          />
          {/* Vertical separator */}
          <div className="h-6 border-l border-gray-300 mx-2"></div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Quick time edition:</span>
            <QuickTimer onJumpToTask={(taskId) => {
              // Find the task and focus on it
              const task = tasks.find(t => t.id === taskId);
              if (task) {
                onFocusOnTask(taskId);
              }
            }} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-grow overflow-hidden">
        {activeView === 'storyboard' ? (
          <div
            className="flex flex-nowrap overflow-x-auto h-full p-2 space-x-4"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, '')} // Handle drop outside of specific cards (at the end)
          >
            {prioritizedTasks.length === 0 ? (
              <div className="text-muted-foreground p-4">No tasks to plan.</div>
            ) : (
              prioritizedTasks.map(task => {
                const children = getAllChildren(task);
                return (
                  <div
                    key={task.id}
                    className="min-w-[300px] max-w-[300px] p-2 border rounded-lg shadow-sm bg-white dark:bg-gray-800"
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, task.id)}
                    style={{
                      opacity: draggedTaskId === task.id ? 0.5 : 1,
                      border: draggedTaskId && draggedTaskId !== task.id ? '2px dashed #ccc' : '2px solid transparent',
                    }}
                  >
                    <TaskCard
                      task={task}
                      tasks={tasks} // Pass all tasks for context
                      updateStatus={updateStatus}
                      updateDifficulty={updateDifficulty}
                      updateCategory={updateCategory}
                      updateTitle={updateTitle}
                      updateUser={updateUser}
                      deleteTask={deleteTask}
                      duplicateTaskStructure={duplicateTaskStructure}
                      toggleUrgent={toggleUrgent}
                      toggleImpact={toggleImpact}
                      toggleMajorIncident={toggleMajorIncident}
                      toggleDone={() => toggleDone(task.id)}
                      toggleTimer={toggleTimer}
                      reparent={reparent}
                      onFocusOnTask={onFocusOnTask}
                      updateTerminationDate={updateTerminationDate}
                      updateComment={updateComment}
                      updateDurationInMinutes={updateDurationInMinutes}
                      disableReparenting={true} // Disable reparenting in PlanView
                      open={!!openParents[task.id]}
                      onToggleOpen={toggleParent}
                    />
                    
                    {/* Render subtasks when expanded */}
                    {openParents[task.id] && children.length > 0 && (
                      <div className="mt-2 space-y-2">
                        <div className="text-xs font-medium text-muted-foreground px-1">
                          Subtasks of: {task.title}
                        </div>
                        {children.map(child => (
                          <div
                            key={child.id}
                            className="p-2 border rounded-md bg-muted/20"
                          >
                            <TaskCard
                              task={child}
                              tasks={tasks}
                              updateStatus={updateStatus}
                              updateDifficulty={updateDifficulty}
                              updateCategory={updateCategory}
                              updateTitle={updateTitle}
                              updateUser={updateUser}
                              deleteTask={deleteTask}
                              duplicateTaskStructure={duplicateTaskStructure}
                              toggleUrgent={toggleUrgent}
                              toggleImpact={toggleImpact}
                              toggleMajorIncident={toggleMajorIncident}
                              toggleDone={() => toggleDone(child.id)}
                              toggleTimer={toggleTimer}
                              reparent={reparent}
                              onFocusOnTask={onFocusOnTask}
                              updateTerminationDate={updateTerminationDate}
                              updateComment={updateComment}
                              updateDurationInMinutes={updateDurationInMinutes}
                              disableReparenting={true}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <ComparativePrioritizationView
            tasks={prioritizedTasks}
            onClose={() => setActiveView('storyboard')}
          />
        )}
      </CardContent>
    </Card>
  );
};

export default PlanView;