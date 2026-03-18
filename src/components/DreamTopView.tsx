import React, { useState, useEffect } from 'react';
import { DreamView } from './DreamView';
import { useViewNavigation, useViewDisplay } from '@/hooks/useView';
import { useTasks, Task, TriageStatus } from '@/hooks/useTasks';
import { useAllTasks } from '@/hooks/useAllTasks';
import { useUserSettings } from '@/hooks/useUserSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TaskCard } from './TaskCard';
import ComparativePrioritizationView from './ComparativePrioritizationView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { sortTasks } from '@/utils/taskSorting';
import { FilterControls, Filters } from "./FilterControls";
import { loadFiltersFromSessionStorage } from "@/lib/filter-storage";
import { getDefaultFilters, validateFilters, mergeViewFilters } from "@/lib/filter-merge";
import { COMPACTNESS_ULTRA, COMPACTNESS_FULL } from "@/context/ViewContextDefinition";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

interface DreamTopViewProps {
  onFocusOnTask: (taskId: string) => void;
}

type ActiveView = 'dream' | 'storyboard' | 'prioritization';

const DreamTopView: React.FC<DreamTopViewProps> = ({ onFocusOnTask }) => {
  const { setView, setFocusedTaskId, focusedTaskId } = useViewNavigation();
  const { cardCompactness } = useViewDisplay();
  const { updateStatus, updateDifficulty, updateCategory, updateTitle, updateUser, deleteTask, duplicateTaskStructure, toggleUrgent, toggleImpact, toggleMajorIncident, toggleSprintTarget, toggleDone, toggleTimer, reparent, updateTerminationDate, updateComment, updateDurationInMinutes, updatePrioritiesBulk, createTask } = useTasks();
  const { tasks } = useAllTasks();
  const { userId: currentUserId } = useUserSettings();

  const [activeView, setActiveView] = useState<ActiveView>('dream');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [reorderingTaskId, setReorderingTaskId] = useState<string | null>(null);
  const [openParents, setOpenParents] = useState<Record<string, boolean>>({});
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(false);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [input, setInput] = useState("");

  const [storedFilters, setStoredFilters] = useState<Filters>(() => getDefaultFilters());
  
  const displayFilters = React.useMemo(() => {
    return mergeViewFilters(storedFilters, { defaultActiveStatuses: true });
  }, [storedFilters]);

  const handlePromoteToKanban = (taskId: string) => {
    setFocusedTaskId(taskId);
    // Navigate to storyboard view within Dream view instead of global Kanban
    setActiveView('storyboard');
  };

  // Auto-switch to storyboard when focusedTaskId is set (e.g., after promoting from fertilization/dream)
  useEffect(() => {
    if (focusedTaskId && activeView !== 'storyboard') {
      setActiveView('storyboard');
    }
  }, [focusedTaskId]);

  // Auto-collapse filters when switching to Ultra Compact mode
  // Auto-expand filters when switching to Full mode
  useEffect(() => {
    if (cardCompactness === COMPACTNESS_ULTRA) {
      setIsFiltersCollapsed(true);
    } else if (cardCompactness === COMPACTNESS_FULL) {
      setIsFiltersCollapsed(false);
    }
  }, [cardCompactness]);

  // Load filters on mount
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const loaded = await loadFiltersFromSessionStorage();
        if (loaded) {
          const validated = validateFilters(loaded);
          setStoredFilters(validated);
        }
      } catch (error) {
        console.error("Error loading filters:", error);
      } finally {
        setLoadingFilters(false);
      }
    };

    loadFilters();
  }, []);

  // Quick add functionality
  const addTopTask = () => {
    const v = input.trim();
    if (!v) return;
    const assignedUserId = storedFilters.selectedUserId && storedFilters.selectedUserId !== 'UNASSIGNED' ? storedFilters.selectedUserId : undefined;
    createTask(v, null, assignedUserId);
    setInput("");
  };

  const prioritizedTasks = React.useMemo(() => {
    return tasks
      .filter(task => !task.parentId && task.triageStatus !== 'Done' && task.triageStatus !== 'Dropped' && task.triageStatus !== 'Archived')
      .filter(task => {
        if (displayFilters.searchText?.trim()) {
          const searchText = displayFilters.searchText.toLowerCase();
          if (!task.title.toLowerCase().includes(searchText)) {
            return false;
          }
        }

        if (displayFilters.showUrgent && !task.urgent) {
          return false;
        }

        if (displayFilters.showImpact && !task.impact) {
          return false;
        }

        if (displayFilters.showMajorIncident && !task.majorIncident) {
          return false;
        }

        if (displayFilters.showSprintTarget && !task.sprintTarget) {
          return false;
        }

        if (displayFilters.difficulty && Array.isArray(displayFilters.difficulty) && displayFilters.difficulty.length > 0 && !displayFilters.difficulty.includes(task.difficulty)) {
          return false;
        }

        if (displayFilters.category && Array.isArray(displayFilters.category) && displayFilters.category.length > 0 && task.category && !displayFilters.category.includes(task.category)) {
          return false;
        }

        if (displayFilters.status && Array.isArray(displayFilters.status) && displayFilters.status.length > 0 && !displayFilters.status.includes(task.triageStatus)) {
          return false;
        }

        if (displayFilters.selectedUserId) {
          if (displayFilters.selectedUserId === 'UNASSIGNED') {
            if (task.userId && task.userId !== 'unassigned') {
              return false;
            }
          } else {
            if (task.userId !== displayFilters.selectedUserId) {
              return false;
            }
          }
        }

        return true;
      })
      .sort(sortTasks.plan);
  }, [tasks, displayFilters]);

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
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, targetTaskId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedTaskId || draggedTaskId === targetTaskId) {
      return;
    }

    const draggedTask = prioritizedTasks.find(task => task.id === draggedTaskId);
    const targetTask = prioritizedTasks.find(task => task.id === targetTaskId);

    if (!draggedTask) return;
    if (!targetTask && targetTaskId !== '') return;

    const currentDisplayOrder = prioritizedTasks;

    const draggedIndex = currentDisplayOrder.findIndex(task => task.id === draggedTaskId);
    const targetIndex = currentDisplayOrder.findIndex(task => task.id === targetTaskId);

    if (targetIndex === -1 && targetTaskId !== '') {
      return;
    }

    let newDisplayOrder;
    if (targetTaskId === '') {
      newDisplayOrder = currentDisplayOrder.filter(task => task.id !== draggedTaskId);
      newDisplayOrder.push(draggedTask);
    } else if (targetIndex !== -1) {
      newDisplayOrder = currentDisplayOrder.filter(task => task.id !== draggedTaskId);
      const adjustedTargetIndex = targetIndex > draggedIndex ? targetIndex - 1 : targetIndex;
      newDisplayOrder.splice(adjustedTargetIndex, 0, draggedTask);
    } else {
      newDisplayOrder = currentDisplayOrder.filter(task => task.id !== draggedTaskId);
      newDisplayOrder.push(draggedTask);
    }

    const updatedPriorities = newDisplayOrder.map((task, index) => ({
      id: task.id,
      priority: index + 1,
    }));
    
    // Set reordering state to show spinner
    setReorderingTaskId(draggedTaskId);
    setDraggedTaskId(null);
    
    try {
      await updatePrioritiesBulk(updatedPriorities);
    } finally {
      setReorderingTaskId(null);
    }
  };

  // View toggle buttons component
  const ViewToggleButtons = () => (
    <div className="flex space-x-2">
      <Button
        variant={activeView === 'dream' ? 'default' : 'outline'}
        onClick={() => setActiveView('dream')}
      >
        Dream
      </Button>
      <Button
        variant={activeView === 'prioritization' ? 'default' : 'outline'}
        onClick={() => setActiveView('prioritization')}
      >
        Prioritization
      </Button>
      <Button
        variant={activeView === 'storyboard' ? 'default' : 'outline'}
        onClick={() => setActiveView('storyboard')}
      >
        Storyboard
      </Button>
    </div>
  );

  // Render Dream view
  if (activeView === 'dream') {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="flex flex-col space-y-4 pb-2">
          <div className="flex flex-row items-center justify-between">
            <CardTitle>Dream View</CardTitle>
            <ViewToggleButtons />
          </div>
        </CardHeader>
        <CardContent className="flex-grow overflow-hidden p-0">
          <DreamView onPromoteToKanban={handlePromoteToKanban} />
        </CardContent>
      </Card>
    );
  }

  // Render Storyboard or Prioritization view
  const viewTitle = activeView === 'storyboard' ? 'Storyboard View' : 'Prioritization View';

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-col space-y-4 pb-2">
        <div className="flex flex-row items-center justify-between">
          <CardTitle>{viewTitle}</CardTitle>
          <ViewToggleButtons />
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

        <div className="mb-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="p-0 h-6 w-6"
              onClick={() => setIsFiltersCollapsed(!isFiltersCollapsed)}
            >
              {isFiltersCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            <span className="text-sm font-medium text-muted-foreground cursor-pointer select-none" onClick={() => setIsFiltersCollapsed(!isFiltersCollapsed)}>
              Filters & Controls
            </span>
          </div>

          {!isFiltersCollapsed && (
            <div className="flex flex-wrap items-center gap-4 border rounded-lg p-3">
              <FilterControls
                filters={storedFilters}
                setFilters={setStoredFilters}
                defaultFilters={getDefaultFilters()}
              />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-grow overflow-hidden">
        {activeView === 'storyboard' ? (
          <div
            className="flex flex-nowrap overflow-x-auto h-full p-2 space-x-4"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, '')}
          >
            {prioritizedTasks.length === 0 ? (
              <div className="text-muted-foreground p-4">No tasks to plan.</div>
            ) : (
              prioritizedTasks.map(task => {
                const children = getAllChildren(task);
                const isReordering = reorderingTaskId === task.id;
                return (
                  <div
                    key={task.id}
                    className="min-w-[300px] max-w-[300px] p-2 border rounded-lg shadow-sm bg-white dark:bg-gray-800 relative"
                    draggable={!isReordering}
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, task.id)}
                    style={{
                      opacity: draggedTaskId === task.id ? 0.5 : 1,
                      border: draggedTaskId && draggedTaskId !== task.id ? '2px dashed #ccc' : '2px solid transparent',
                    }}
                  >
                    {isReordering && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-lg z-10">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    )}
                    <TaskCard
                      task={task}
                      tasks={tasks}
                      isHighlighted={task.id === focusedTaskId}
                      updateStatus={updateStatus}
                      updateDifficulty={updateDifficulty}
                      updateCategory={updateCategory}
                      updateTitle={updateTitle}
                      updateUser={(id, userId) => updateUser(id, userId === 'current-user' ? currentUserId : userId)}
                      deleteTask={deleteTask}
                      duplicateTaskStructure={duplicateTaskStructure}
                      toggleUrgent={toggleUrgent}
                      toggleImpact={toggleImpact}
                      toggleMajorIncident={toggleMajorIncident}
                      toggleSprintTarget={toggleSprintTarget}
                      toggleDone={() => toggleDone(task.id)}
                      toggleTimer={toggleTimer}
                      reparent={reparent}
                      onFocusOnTask={onFocusOnTask}
                      updateTerminationDate={updateTerminationDate}
                      updateComment={updateComment}
                      updateDurationInMinutes={updateDurationInMinutes}
                      disableReparenting={true}
                      open={!!openParents[task.id]}
                      onToggleOpen={toggleParent}
                    />

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
                              isHighlighted={child.id === focusedTaskId}
                              updateStatus={updateStatus}
                              updateDifficulty={updateDifficulty}
                              updateCategory={updateCategory}
                              updateTitle={updateTitle}
                              updateUser={(id, userId) => updateUser(id, userId === 'current-user' ? currentUserId : userId)}
                              deleteTask={deleteTask}
                              duplicateTaskStructure={duplicateTaskStructure}
                              toggleUrgent={toggleUrgent}
                              toggleImpact={toggleImpact}
                              toggleMajorIncident={toggleMajorIncident}
                              toggleSprintTarget={toggleSprintTarget}
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
            onClose={() => setActiveView('dream')}
          />
        )}
      </CardContent>
    </Card>
  );
};

export default DreamTopView;
