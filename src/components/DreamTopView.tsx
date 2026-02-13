import React, { useState, useEffect } from 'react';
import { DreamView } from './DreamView';
import { useViewNavigation, useViewDisplay } from '@/hooks/useView';
import { useTasks, Task } from '@/hooks/useTasks';
import { useUserSettings } from '@/hooks/useUserSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TaskCard } from './TaskCard';
import ComparativePrioritizationView from './ComparativePrioritizationView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { sortTasks } from '@/utils/taskSorting';
import { FilterControls, Filters } from "./FilterControls";
import { loadFiltersFromSessionStorage } from "@/lib/filter-storage";
import { QuickTimer } from "@/components/QuickTimer";
import { COMPACTNESS_ULTRA, COMPACTNESS_FULL } from "@/context/ViewContextDefinition";
import { ChevronDown, ChevronRight } from "lucide-react";

interface DreamTopViewProps {
  onFocusOnTask: (taskId: string) => void;
}

type ActiveView = 'dream' | 'storyboard' | 'prioritization';

const DreamTopView: React.FC<DreamTopViewProps> = ({ onFocusOnTask }) => {
  const { setView, setFocusedTaskId } = useViewNavigation();
  const { cardCompactness } = useViewDisplay();
  const { tasks, updateStatus, updateDifficulty, updateCategory, updateTitle, updateUser, deleteTask, duplicateTaskStructure, toggleUrgent, toggleImpact, toggleMajorIncident, toggleDone, toggleTimer, reparent, updateTerminationDate, updateComment, updateDurationInMinutes, updatePriority, createTask } = useTasks();
  const { userId: currentUserId } = useUserSettings();

  const [activeView, setActiveView] = useState<ActiveView>('dream');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [openParents, setOpenParents] = useState<Record<string, boolean>>({});
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(false);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [input, setInput] = useState("");

  const defaultPlanViewFilters: Filters = {
    showUrgent: false,
    showImpact: false,
    showMajorIncident: false,
    status: ["Backlog", "Ready", "WIP", "Blocked"],
    searchText: "",
    difficulty: [],
    category: []
  };

  const [filters, setFilters] = useState<Filters>(defaultPlanViewFilters);

  const handlePromoteToKanban = (taskId: string) => {
    setFocusedTaskId(taskId);
    setView('kanban');
  };

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
        const storedFilters = await loadFiltersFromSessionStorage();
        if (storedFilters) {
          setFilters(storedFilters);
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
    const assignedUserId = filters.selectedUserId && filters.selectedUserId !== 'UNASSIGNED' ? filters.selectedUserId : undefined;
    createTask(v, null, assignedUserId);
    setInput("");
  };

  const prioritizedTasks = React.useMemo(() => {
    return tasks
      .filter(task => !task.parentId && task.triageStatus !== 'Done' && task.triageStatus !== 'Dropped')
      .filter(task => {
        if (filters.searchText?.trim()) {
          const searchText = filters.searchText.toLowerCase();
          if (!task.title.toLowerCase().includes(searchText)) {
            return false;
          }
        }

        if (filters.showUrgent && !task.urgent) {
          return false;
        }

        if (filters.showImpact && !task.impact) {
          return false;
        }

        if (filters.showMajorIncident && !task.majorIncident) {
          return false;
        }

        if (filters.difficulty && Array.isArray(filters.difficulty) && filters.difficulty.length > 0 && !filters.difficulty.includes(task.difficulty)) {
          return false;
        }

        if (filters.category && Array.isArray(filters.category) && filters.category.length > 0 && task.category && !filters.category.includes(task.category)) {
          return false;
        }

        if (filters.status && Array.isArray(filters.status) && filters.status.length > 0 && !filters.status.includes(task.triageStatus)) {
          return false;
        }

        if (filters.selectedUserId) {
          if (filters.selectedUserId === 'UNASSIGNED') {
            if (task.userId && task.userId !== 'unassigned') {
              return false;
            }
          } else {
            if (task.userId !== filters.selectedUserId) {
              return false;
            }
          }
        }

        return true;
      })
      .sort(sortTasks.plan);
  }, [tasks, filters]);

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

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetTaskId: string) => {
    e.preventDefault();
    if (!draggedTaskId || draggedTaskId === targetTaskId) {
      return;
    }

    const draggedTask = tasks.find(task => task.id === draggedTaskId);
    const targetTask = tasks.find(task => task.id === targetTaskId);

    if (!draggedTask || !targetTask) return;

    const visibleTopLevelTasks = tasks.filter(task => !task.parentId && task.triageStatus !== 'Done' && task.triageStatus !== 'Dropped');
    const currentDisplayOrder = [...visibleTopLevelTasks].sort(sortTasks.plan);

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

    newDisplayOrder.forEach((task, index) => {
      const newPriority = index + 1;
      updatePriority(task.id, newPriority);
    });

    setDraggedTaskId(null);
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
                filters={filters}
                setFilters={setFilters}
                defaultFilters={defaultPlanViewFilters}
              />
              <div className="h-6 border-l border-gray-300 mx-2"></div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Quick time edition:</span>
                <QuickTimer onJumpToTask={(taskId) => {
                  const task = tasks.find(t => t.id === taskId);
                  if (task) {
                    onFocusOnTask(taskId);
                  }
                }} />
              </div>
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
                      tasks={tasks}
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
