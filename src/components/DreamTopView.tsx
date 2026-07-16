import React, { useState, useEffect } from 'react';
import { DreamView } from './DreamView';
import { useViewNavigation, useViewDisplay } from '@/hooks/useView';
import { useTasks, Task } from '@/hooks/useTasks';
import { useAllTasks } from '@/hooks/useAllTasks';
import { QuickAddTask } from './QuickAddTask';
import { useUserSettings } from '@/hooks/useUserSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StoryboardCard } from './StoryboardCard';
import ComparativePrioritizationView from './ComparativePrioritizationView';
import { Button } from '@/components/ui/button';
import { sortTasks } from '@/utils/taskSorting';
import { FilterControls, Filters } from "./FilterControls";
import { loadFiltersFromSessionStorage } from "@/lib/filter-storage";
import { getDefaultFilters, validateFilters, mergeViewFilters } from "@/lib/filter-merge";
import { COMPACTNESS_ULTRA, COMPACTNESS_FULL } from "@/context/ViewContextDefinition";
import { ChevronDown, ChevronRight } from "lucide-react";
import { FocusModeProvider } from "./FocusModeProvider";
import { FocusModeOverlay } from "./FocusModeOverlay";
import { FocusModeBar } from './planView/FocusModeBar';
import { IntentionalFrameworkViewInner } from './IntentionalFrameworkView';
import { CollaborativeFrameworkViewInner } from './CollaborativeFrameworkView';
import { useFocusMode } from "@/hooks/useFocusMode";
import type { ModuleId } from '@/lib/persistence-types';

interface DreamTopViewProps {
  onFocusOnTask: (taskId: string) => void;
}

type ActiveView = 'intentionalFramework' | 'collaborativeFramework' | 'dream' | 'storyboard' | 'prioritization';

const ViewToggleButtons: React.FC<{ activeView: ActiveView; setActiveView: (v: ActiveView) => void; enabledSubViews: ActiveView[] }> = React.memo(({ activeView, setActiveView, enabledSubViews }) => (
  <div className="flex space-x-2">
    {enabledSubViews.includes('intentionalFramework') && (
    <Button
      variant={activeView === 'intentionalFramework' ? 'default' : 'outline'}
      onClick={() => setActiveView('intentionalFramework')}
    >
      Intention
    </Button>
    )}
    {enabledSubViews.includes('collaborativeFramework') && (
    <Button
      variant={activeView === 'collaborativeFramework' ? 'default' : 'outline'}
      onClick={() => setActiveView('collaborativeFramework')}
    >
      Collaboration
    </Button>
    )}
    {enabledSubViews.includes('dream') && (
    <Button
      variant={activeView === 'dream' ? 'default' : 'outline'}
      onClick={() => setActiveView('dream')}
    >
      Dream
    </Button>
    )}
    {enabledSubViews.includes('storyboard') && (
    <Button
      variant={activeView === 'storyboard' ? 'default' : 'outline'}
      onClick={() => setActiveView('storyboard')}
    >
      Storyboard
    </Button>
    )}
    {enabledSubViews.includes('prioritization') && (
    <Button
      variant={activeView === 'prioritization' ? 'default' : 'outline'}
      onClick={() => setActiveView('prioritization')}
    >
      Prioritization
    </Button>
    )}
  </div>
));

const DreamTopViewInner: React.FC<DreamTopViewProps> = ({ onFocusOnTask }) => {
  const { setFocusedTaskId, focusedTaskId, pendingSubView, clearPendingSubView, disabledModules } = useViewNavigation();
  const { cardCompactness } = useViewDisplay();
  const { updateStatus, updateDifficulty, updateCategory, updateTitle, updateUser, deleteTask, duplicateTaskStructure, toggleUrgent, toggleImpact, toggleMajorIncident, toggleSprintTarget, toggleDone, toggleTimer, reparent, updateTerminationDate, updateComment, updateDurationInMinutes, updatePrioritiesBulk } = useTasks();
  const { tasks } = useAllTasks();
  const { userId: currentUserId } = useUserSettings();
  const { isFocusMode } = useFocusMode();

  const enabledSubViews: ActiveView[] = (['intentionalFramework', 'collaborativeFramework', 'dream', 'storyboard', 'prioritization'] as ActiveView[]).filter(
    v => !disabledModules.includes(`dream.${v}` as ModuleId)
  );

  const [activeView, setActiveView] = useState<ActiveView>('storyboard');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [reorderingTaskId, setReorderingTaskId] = useState<string | null>(null);
  const [openParents, setOpenParents] = useState<Record<string, boolean>>({});
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(false);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const storyboardContainerRef = React.useRef<HTMLDivElement>(null);
  const autoScrollRafRef = React.useRef<number | null>(null);
  const autoScrollDirectionRef = React.useRef<number>(0);

  const [storedFilters, setStoredFilters] = useState<Filters>(() => getDefaultFilters());

  const displayFilters = React.useMemo(() => {
    return mergeViewFilters(storedFilters, { defaultActiveStatuses: true });
  }, [storedFilters]);

  const handlePromoteToKanban = React.useCallback((taskId: string) => {
    setFocusedTaskId(taskId);
    // Navigate to storyboard view within Dream Board instead of global Kanban
    setActiveView('storyboard');
  }, [setFocusedTaskId]);

  // Auto-switch to storyboard when focusedTaskId is set (e.g., after promoting from fertilization/dream)
  useEffect(() => {
    if (focusedTaskId && activeView !== 'storyboard') {
      setActiveView('storyboard');
    }
  }, [focusedTaskId, activeView]);

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

  // Consume pending sub-view from Umbrella navigation
  useEffect(() => {
    if (!pendingSubView) return;
    const valid: ActiveView[] = ['intentionalFramework', 'collaborativeFramework', 'dream', 'storyboard', 'prioritization'];
    if (valid.includes(pendingSubView as ActiveView) && enabledSubViews.includes(pendingSubView as ActiveView)) {
      setActiveView(pendingSubView as ActiveView);
      clearPendingSubView();
    }
  }, [pendingSubView, clearPendingSubView, enabledSubViews]);

  // Auto-select enabled sub-view if current is disabled
  useEffect(() => {
    if (enabledSubViews.length > 0 && !enabledSubViews.includes(activeView)) {
      setActiveView(enabledSubViews[0]);
    }
  }, [enabledSubViews, activeView]);

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

  const stopAutoScroll = React.useCallback(() => {
    autoScrollDirectionRef.current = 0;
    if (autoScrollRafRef.current !== null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }, []);

  const tickAutoScroll = React.useCallback(() => {
    const container = storyboardContainerRef.current;
    if (!container || autoScrollDirectionRef.current === 0) {
      autoScrollRafRef.current = null;
      return;
    }
    const speed = 12; // px per frame
    container.scrollLeft += autoScrollDirectionRef.current * speed;
    autoScrollRafRef.current = requestAnimationFrame(tickAutoScroll);
  }, []);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (activeView !== 'storyboard') return;
    const container = storyboardContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const EDGE = 60;
    const clientX = e.clientX;
    let direction = 0;
    if (clientX - rect.left < EDGE) direction = -1;
    else if (rect.right - clientX < EDGE) direction = 1;
    if (direction !== autoScrollDirectionRef.current) {
      autoScrollDirectionRef.current = direction;
      if (direction !== 0 && autoScrollRafRef.current === null) {
        autoScrollRafRef.current = requestAnimationFrame(tickAutoScroll);
      }
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, targetTaskId: string) => {
    stopAutoScroll();
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

  // Render Dream Board
  if (activeView === 'dream') {
    return (
      <div className="h-full flex flex-col">
        <Card className={`flex-1 flex flex-col border-0 shadow-none ${isFocusMode ? 'overflow-auto' : ''}`}>
          {!isFocusMode && (
            <CardHeader className="flex flex-col space-y-4 pb-2">
              <div className="flex flex-row items-center justify-between">
                <CardTitle>Dream Board</CardTitle>
                <ViewToggleButtons activeView={activeView} setActiveView={setActiveView} enabledSubViews={enabledSubViews} />
              </div>
            </CardHeader>
          )}
          <CardContent className="flex-grow overflow-hidden p-0">
            <DreamView
              onPromoteToKanban={handlePromoteToKanban}
              focusModeHeaderContent={isFocusMode ? <ViewToggleButtons activeView={activeView} setActiveView={setActiveView} enabledSubViews={enabledSubViews} /> : undefined}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render Intentional Framework sub-view
  if (activeView === 'intentionalFramework') {
    const viewTitle = 'Intentional Framework';
    return (
      <div className={`h-full flex flex-col ${isFocusMode ? 'relative' : ''}`}>
        {isFocusMode && <FocusModeBar title={viewTitle} rightContent={<ViewToggleButtons activeView={activeView} setActiveView={setActiveView} enabledSubViews={enabledSubViews} />} />}
        <Card className={`flex-1 flex flex-col border-0 shadow-none ${isFocusMode ? 'overflow-auto' : ''}`}>
          {!isFocusMode && (
            <CardHeader className="flex flex-col space-y-4 pb-2">
              <div className="flex flex-row items-center justify-between">
                <CardTitle>{viewTitle}</CardTitle>
                <ViewToggleButtons activeView={activeView} setActiveView={setActiveView} enabledSubViews={enabledSubViews} />
              </div>
            </CardHeader>
          )}
          <CardContent className="flex-grow overflow-auto">
            <IntentionalFrameworkViewInner hideHeader />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render Collaborative Framework sub-view
  if (activeView === 'collaborativeFramework') {
    const viewTitle = 'Collaborative Framework';
    return (
      <div className={`h-full flex flex-col ${isFocusMode ? 'relative' : ''}`}>
        {isFocusMode && <FocusModeBar title={viewTitle} rightContent={<ViewToggleButtons activeView={activeView} setActiveView={setActiveView} enabledSubViews={enabledSubViews} />} />}
        <Card className={`flex-1 flex flex-col border-0 shadow-none ${isFocusMode ? 'overflow-auto' : ''}`}>
          {!isFocusMode && (
            <CardHeader className="flex flex-col space-y-4 pb-2">
              <div className="flex flex-row items-center justify-between">
                <CardTitle>{viewTitle}</CardTitle>
                <ViewToggleButtons activeView={activeView} setActiveView={setActiveView} enabledSubViews={enabledSubViews} />
              </div>
            </CardHeader>
          )}
          <CardContent className="flex-grow overflow-auto">
            <CollaborativeFrameworkViewInner hideHeader />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render Storyboard or Prioritization view
  const viewTitle = activeView === 'storyboard' ? 'Storyboard View' : 'Prioritization View';

  return (
    <div className={`h-full flex flex-col ${isFocusMode ? 'relative' : ''}`}>
      {isFocusMode && (
        <>
          <FocusModeBar
            title={viewTitle}
            rightContent={
              <ViewToggleButtons activeView={activeView} setActiveView={setActiveView} enabledSubViews={enabledSubViews} />
            }
            hasActiveFilters={
              !!storedFilters.searchText?.trim() ||
              !!storedFilters.selectedUserId ||
              (storedFilters.difficulty?.length || 0) > 0 ||
              (storedFilters.category?.length || 0) > 0 ||
              (storedFilters.status?.length || 0) > 0 ||
              storedFilters.showUrgent ||
              storedFilters.showImpact ||
              storedFilters.showMajorIncident ||
              storedFilters.showSprintTarget
            }
            filterDropdownContent={
              <FilterControls
                filters={storedFilters}
                setFilters={setStoredFilters}
                defaultFilters={getDefaultFilters()}
              />
            }
          />
        </>
      )}
      <Card className={`flex-1 flex flex-col border-0 shadow-none ${isFocusMode ? 'overflow-auto' : ''}`}>
        {!isFocusMode && (
          <CardHeader className="flex flex-col space-y-4 pb-2">
            <div className="flex flex-row items-center justify-between">
              <CardTitle>{viewTitle}</CardTitle>
              <ViewToggleButtons activeView={activeView} setActiveView={setActiveView} enabledSubViews={enabledSubViews} />
            </div>

            <div className="mb-2 flex gap-2 items-center">
              <QuickAddTask
                userId={storedFilters.selectedUserId && storedFilters.selectedUserId !== 'UNASSIGNED' ? storedFilters.selectedUserId : undefined}
                onCreatedFromTemplate={(parentId) => onFocusOnTask?.(parentId)}
                className="max-w-md"
              />
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
        )}
        <CardContent className="flex-grow overflow-hidden">
          {activeView === 'storyboard' ? (
            <div
              className="flex flex-nowrap overflow-x-auto h-full p-2 gap-3"
              ref={storyboardContainerRef}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, '')}
              onDragEndCapture={stopAutoScroll}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) stopAutoScroll();
              }}
            >
              {prioritizedTasks.length === 0 ? (
                <div className="text-muted-foreground p-4">No tasks to plan.</div>
              ) : (
                prioritizedTasks.map(task => {
                  const children = getAllChildren(task);
                  const isReordering = reorderingTaskId === task.id;
                  return (
                    <div key={task.id} className="flex flex-col gap-2 min-w-fit">
                      <StoryboardCard
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
                        isReordering={isReordering}
                        isDragged={draggedTaskId === task.id}
                        isDragOver={!!draggedTaskId && draggedTaskId !== task.id}
                        draggable={!isReordering}
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, task.id)}
                      />

                      {openParents[task.id] && children.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-muted-foreground px-1">
                            Subtasks of: {task.title}
                          </div>
                          {children.map(child => (
                            <StoryboardCard
                              key={child.id}
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
                              isDragged={draggedTaskId === child.id}
                              isDragOver={!!draggedTaskId && draggedTaskId !== child.id}
                            />
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
    </div>
  );
};

const DreamTopView: React.FC<DreamTopViewProps> = ({ onFocusOnTask }) => {
  return (
    <FocusModeProvider viewId="dream">
      <FocusModeOverlay>
        <DreamTopViewInner onFocusOnTask={onFocusOnTask} />
      </FocusModeOverlay>
    </FocusModeProvider>
  );
};

export default DreamTopView;
