import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { otelProfilerCallback } from "@/telemetry";
import { Input } from "@/components/ui/input";
import { Plus, CornerDownRight, FolderTree, Printer, Filter, ChevronDown, ChevronRight, PlusCircle, MinusCircle } from "lucide-react";
import { FilterControls, Filters } from "./FilterControls";
import { useTasks, Task, TriageStatus } from "@/hooks/useTasks";
import { useAllTasks } from "@/hooks/useAllTasks";
import { useUserSettings } from "@/hooks/useUserSettings";
import { aStarTextSearch } from "@/lib/a-star-search";
import { loadFiltersFromSessionStorage } from "@/lib/filter-storage";
import { mergeViewFilters } from "@/lib/filter-merge";
import { sortTasks } from "@/utils/taskSorting";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { TaskCard } from "./TaskCard";
import { LazyCard } from "./LazyCard";
import { TodolistView } from "./TodolistView";

import { byId } from "@/lib/utils";
import { useViewDisplay } from "@/hooks/useView";
import { COMPACTNESS_ULTRA, COMPACTNESS_FULL } from "@/context/ViewContextDefinition";
import { HOVER_ENTER_DELAY_MS } from "@/lib/hover-constants";
import { FocusModeProvider } from "./FocusModeProvider";
import { FocusModeOverlay } from "./FocusModeOverlay";
import { FocusModeBar } from "./planView/FocusModeBar";
import { useFocusMode } from "@/hooks/useFocusMode";

type FocusBoardView = "flow" | "todolist";

const FOCUS_BOARD_VIEW_KEY = "focus-board-view";

const loadViewPreference = (): FocusBoardView => {
  try {
    const stored = sessionStorage.getItem(FOCUS_BOARD_VIEW_KEY);
    if (stored === "todolist" || stored === "flow") return stored;
  } catch {
    // sessionStorage not available
  }
  return "todolist";
};

const saveViewPreference = (view: FocusBoardView) => {
  try {
    sessionStorage.setItem(FOCUS_BOARD_VIEW_KEY, view);
  } catch {
    // sessionStorage not available
  }
};

type Column = {
  parentId: string | null;
  items: Task[];
  activeId?: string;
};

const TaskBoardInner: React.FC<{ focusedTaskId?: string | null; onFocusOnTask?: (taskId: string) => void }> = ({ focusedTaskId, onFocusOnTask }) => {
  const { t } = useTranslation();
  const { isFocusMode } = useFocusMode();
  const [focusView, setFocusView] = React.useState<FocusBoardView>(loadViewPreference);

  const handleFocusViewChange = React.useCallback((view: string) => {
    if (view === "flow" || view === "todolist") {
      setFocusView(view);
      saveViewPreference(view);
    }
  }, []);

  const { createTask, reparent, updateStatus, toggleUrgent, toggleImpact, toggleMajorIncident, toggleSprintTarget, updateDifficulty, updateTitle, updateUser, deleteTask, duplicateTaskStructure, toggleDone, updateTaskTimer, toggleTimer, updateTimeEntry, updateCategory, updateComment, updateTerminationDate, updateDurationInMinutes } = useTasks();
  const { tasks } = useAllTasks();
  const { userId: currentUserId } = useUserSettings();
  const map = React.useMemo(() => byId(tasks), [tasks]);
  const mapRef = React.useRef(map);
  mapRef.current = map;

  // Focus restoration
  const [focusTargetId, setFocusTargetId] = React.useState<string | null>(null);

  const handleToggleTimer = async (id: string) => {
    await toggleTimer(id, currentUserId);
    setFocusTargetId(id);

    // If starting the timer (currently not running), highlight and activate the task
    const task = map[id];
    const isRunning = task?.timer?.some(t => t.endTime === 0);

    if (task && !isRunning) {
      setHighlightedTaskId(id);

      const newPath: string[] = [];
      let current: Task | undefined = task;
      while (current) {
        newPath.unshift(current.id);
        current = current.parentId ? map[current.parentId] : undefined;
      }
      setPath(newPath);
    }
  };

  React.useEffect(() => {
    if (focusTargetId && cardRefs.current[focusTargetId]) {
      cardRefs.current[focusTargetId]?.focus();
      setFocusTargetId(null);
    }
  }, [tasks, focusTargetId]);

  const [path, setPath] = React.useState<string[]>([]);

  const [highlightedTaskId, setHighlightedTaskId] = React.useState<string | null>(null);

  const scrollTodolistRowRef = React.useRef<Map<string, HTMLElement>>(new Map());
  const lastHandledFocusIdRef = React.useRef<string | null>(null);

  const handleFocusOnTaskInternal = React.useCallback((taskId: string) => {
    setHighlightedTaskId(taskId);

    const task = map[taskId];
    if (task) {
      const ancestorIds: string[] = [];
      let current: Task | undefined = task;
      while (current) {
        ancestorIds.unshift(current.id);
        current = current.parentId ? map[current.parentId] : undefined;
      }
      if (focusView === "todolist") {
        setExpandedParents(prev => {
          const next = new Set(prev);
          for (let i = 0; i < ancestorIds.length - 1; i++) {
            next.add(ancestorIds[i]);
          }
          return next;
        });
      } else {
        setPath(ancestorIds);
      }
    }

    setTimeout(() => {
      const el = scrollTodolistRowRef.current.get(taskId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);

    setTimeout(() => setHighlightedTaskId(null), 3000);

    if (onFocusOnTask) onFocusOnTask(taskId);
  }, [map, focusView, onFocusOnTask]);

  const defaultTaskBoardFilters: Filters = {
    showUrgent: false,
    showImpact: false,
    showMajorIncident: false,
    showSprintTarget: false,
    status: ["Backlog", "Ready", "WIP", "Blocked"], // All non-Done, non-Dropped statuses by default
    searchText: "",
    difficulty: [],
    category: []
  };

  // Separate stored filters (user preferences) from display filters (view-specific)
  // storedFilters: Original user preferences from localStorage (never modified by view)
  // displayFilters: Derived with view-specific exclusions for rendering
  const [storedFilters, setStoredFilters] = React.useState<Filters>(defaultTaskBoardFilters);
  const [loadingFilters, setLoadingFilters] = React.useState(true);
  const { cardCompactness } = useViewDisplay();
  const [isFiltersCollapsed, setIsFiltersCollapsed] = React.useState(false);

  const [expandedParents, setExpandedParents] = React.useState<Set<string>>(new Set());

  const allParentIds = React.useMemo(() => {
    return tasks
      .filter(t => t.children && t.children.length > 0)
      .map(t => t.id);
  }, [tasks]);

  const expandAllParents = () => setExpandedParents(new Set(allParentIds));
  const collapseAllParents = () => setExpandedParents(new Set());

  const displayFilters = React.useMemo(() => {
    // TaskBoard excludes Done/Dropped/Archived from the stored status filter
    return mergeViewFilters(storedFilters, {
      excludeStatuses: ["Done", "Dropped", "Archived"]
    });
  }, [storedFilters]);

  // Auto-collapse filters when switching to Ultra Compact mode
  // Auto-expand filters when switching to Full mode
  React.useEffect(() => {
    if (cardCompactness === COMPACTNESS_ULTRA) {
      setIsFiltersCollapsed(true);
    } else if (cardCompactness === COMPACTNESS_FULL) {
      setIsFiltersCollapsed(false);
    }
  }, [cardCompactness]);

  React.useEffect(() => {
    if (focusedTaskId && focusedTaskId !== lastHandledFocusIdRef.current && map[focusedTaskId] && focusView === "todolist") {
      lastHandledFocusIdRef.current = focusedTaskId;
      handleFocusOnTaskInternal(focusedTaskId);
    }
    if (!focusedTaskId) {
      lastHandledFocusIdRef.current = null;
    }
  }, [focusedTaskId, focusView, map, handleFocusOnTaskInternal]);

  // Load filters on mount
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const loaded = await loadFiltersFromSessionStorage();
        if (loaded) {
          setStoredFilters(loaded);
        }
      } catch (error) {
        console.error("Error loading filters:", error);
      } finally {
        setLoadingFilters(false);
      }
    };

    loadFilters();
  }, []);

  // Effect to update session storage when filters change
  useEffect(() => {
    // The FilterControls component now handles saving filters to session storage
    // No need to save here directly, as setStoredFilters is passed to FilterControls
  }, [storedFilters]);

  const cardRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

  React.useEffect(() => {
    if (focusedTaskId && map[focusedTaskId]) {
      const task = map[focusedTaskId];
      if (task) {
        const newPath: string[] = [];
        let current: Task | undefined = task;
        while (current) {
          newPath.unshift(current.id);
          current = current.parentId ? map[current.parentId] : undefined;
        }
        setPath(newPath);

        setTimeout(() => {
          cardRefs.current[focusedTaskId]?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 100); // Timeout to allow columns to render
      }
    }
  }, [focusedTaskId, map]);


  // When tasks change (from Triage view or here), prune path to valid chain
  React.useEffect(() => {
    if (path.length === 0) return;
    const newPath: string[] = [];
    let parentId: string | null = null;

    // Root level: any top task is ok
    const rootIds = tasks.filter((t) => !t.parentId).map((t) => t.id);
    if (rootIds.includes(path[0])) {
      newPath.push(path[0]);
      parentId = path[0];
    } else {
      setPath([]);
      return;
    }

    for (let i = 1; i < path.length; i++) {
      const prev = map[parentId!];
      const children = (prev?.children || []).filter((id) => !!map[id]);
      if (children.includes(path[i])) {
        newPath.push(path[i]);
        parentId = path[i];
      } else {
        break;
      }
    }

    if (newPath.length !== path.length) {
      setPath(newPath);
    }
  }, [tasks, map, path]);

  // We're applying filters at the card level now, so we don't need this filteredTasks computation

  const columns: Column[] = React.useMemo(() => {
    const cols: Column[] = [];

    // Global search for subtasks
    if (displayFilters.searchText?.trim()) {
      const searchLower = displayFilters.searchText.toLowerCase();
      const allSearchableTasks = tasks.filter(t => !t.parentId).map(t => ({ id: t.id, title: t.title }));
      const searchResults = aStarTextSearch(displayFilters.searchText, allSearchableTasks);
      const matchingTaskIds = new Set(searchResults.filter(r => r.score >= 0.001).map(r => r.taskId));

      const searchResultTasks = tasks.filter(task => matchingTaskIds.has(task.id));

      cols.push({
        parentId: "search-results", // Unique ID for search results column
        items: searchResultTasks.sort(sortTasks.taskboard),
        activeId: null, // No active task in search results column
      });
    }

    const rootItems = tasks.filter((t) => !t.parentId).sort(sortTasks.taskboard);

    // Apply Focus Mode: If a root task is selected (path[0]), only show that task
    const filteredRootItems = path[0] ? rootItems.filter(t => t.id === path[0]) : rootItems;

    cols.push({ parentId: null, items: filteredRootItems, activeId: path[0] });

    path.forEach((taskId, idx) => {
      const t = map[taskId];
      if (!t) return;
      // Show all children to ensure tasks from other columns are visible
      let children = ((t.children || [])
        .map((id) => map[id])
        .filter(Boolean) as Task[]).sort(sortTasks.taskboard);

      // Apply Focus Mode: If a child is selected in this column (path[idx + 1]), only show that child
      if (path[idx + 1]) {
        children = children.filter(c => c.id === path[idx + 1]);
      }

      cols.push({
        parentId: t.id,
        items: children,
        activeId: path[idx + 1],
      });
    });
    return cols;
  }, [tasks, map, path, displayFilters]);

  const handleActivate = (colIndex: number, id: string) => {
    // Implement Toggle Off:
    // If clicking the currently active task in this column, deselect it (and all consecutive paths)
    if (path[colIndex] === id) {
      const newPath = path.slice(0, colIndex);
      setPath(newPath);
      setHighlightedTaskId(null);
      return;
    }

    const newPath = path.slice(0, colIndex);
    newPath[colIndex] = id;
    setPath(newPath);
    setHighlightedTaskId(null); // Clear highlighted task on normal activation
  };

  const handleAdd = async (colIndex: number, title: string) => {
    const parentId = colIndex === 0 ? null : columns[colIndex].parentId!;
    const assignedUserId = storedFilters.selectedUserId && storedFilters.selectedUserId !== 'UNASSIGNED' ? storedFilters.selectedUserId : undefined;
    const newId = await createTask(title, parentId, assignedUserId);
    handleActivate(colIndex, newId);
  };

  // Sync kanban status with done when changed via dropdown
  const handleChangeStatus = React.useCallback(
    (taskId: string, status: TriageStatus) => {
      updateStatus(taskId, status);
    },
    [updateStatus],
  );

  const handleUpdateUser = React.useCallback(
    (id: string, userId: string | undefined) => {
      updateUser(id, userId === 'current-user' ? currentUserId : userId);
    },
    [updateUser, currentUserId],
  );

  const handleToggleDone = React.useCallback(
    (task: Task) => {
      toggleDone(task.id);
    },
    [toggleDone],
  );

  // Thread drawing
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [lines, setLines] = React.useState<Array<{ x1: number; y1: number; x2: number; y2: number }>>([]);

  const recomputeLines = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const activeEls = Array.from(container.querySelectorAll("[data-active-card='true']")) as HTMLElement[];

    const pairs: Array<[HTMLElement, HTMLElement]> = [];
    for (let i = 0; i < activeEls.length - 1; i++) {
      pairs.push([activeEls[i], activeEls[i + 1]]);
    }

    const rectContainer = container.getBoundingClientRect();
    const nextLines = pairs.map(([a, b]) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const x1 = ra.right - rectContainer.left + container.scrollLeft;
      const y1 = ra.top + ra.height / 2 - rectContainer.top + container.scrollTop;
      const x2 = rb.left - rectContainer.left + container.scrollLeft;
      const y2 = rb.top + rb.height / 2 - rectContainer.top + container.scrollTop;
      return { x1, y1, x2, y2 };
    });

    setLines(nextLines);
  }, []);

  React.useLayoutEffect(() => {
    recomputeLines();
  }, [recomputeLines, columns]);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => recomputeLines();
    el.addEventListener("scroll", onScroll, { passive: true });

    const ro = new ResizeObserver(() => recomputeLines());
    ro.observe(el);

    const onResize = () => recomputeLines();
    window.addEventListener("resize", onResize);

    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [recomputeLines]);

  const hasActiveFilters =
    !!storedFilters.searchText?.trim() ||
    !!storedFilters.selectedUserId ||
    (storedFilters.difficulty?.length || 0) > 0 ||
    (storedFilters.category?.length || 0) > 0 ||
    (storedFilters.status?.length || 0) > 0 ||
    storedFilters.showUrgent ||
    storedFilters.showImpact ||
    storedFilters.showMajorIncident ||
    storedFilters.showSprintTarget;

  const viewToggle = (
    <ToggleGroup type="single" value={focusView} onValueChange={handleFocusViewChange} aria-label={t('taskboard.flowViewAria')}>
      <ToggleGroupItem value="flow" aria-label={t('taskboard.flowViewAria')}>
        {t('taskboard.flow')}
      </ToggleGroupItem>
      <ToggleGroupItem value="todolist" aria-label={t('taskboard.todolistViewAria')}>
        {t('taskboard.todolist')}
      </ToggleGroupItem>
    </ToggleGroup>
  );

  return (
    <React.Profiler id="TaskBoard" onRender={otelProfilerCallback}>
    <FocusModeOverlay>
    <div className="w-full h-full flex flex-col">
      {isFocusMode && (
        <FocusModeBar
          title={focusView === 'flow' ? t('taskboard.flowViewTitle') : t('taskboard.todolistViewTitle')}
          rightContent={viewToggle}
          hasActiveFilters={hasActiveFilters}
          filterDropdownContent={
            <FilterControls
              filters={storedFilters}
              setFilters={setStoredFilters}
              defaultFilters={defaultTaskBoardFilters}
            />
          }
        />
      )}
      {!isFocusMode && (
      <div className="mb-4 flex flex-col gap-2 shrink-0">
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
            {t('taskboard.filtersAndControls')}
          </span>
          {focusView === "todolist" && (
            <div className="flex items-center gap-1 ml-2">
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={expandAllParents}>
                <PlusCircle className="w-3.5 h-3.5 mr-1" /> {t('taskboard.expandAll')}
              </Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={collapseAllParents}>
                <MinusCircle className="w-3.5 h-3.5 mr-1" /> {t('taskboard.collapseAll')}
              </Button>
            </div>
          )}
          <div className="ml-auto">
            {viewToggle}
          </div>
        </div>

        {!isFiltersCollapsed && (
          <div className="flex flex-wrap items-center gap-4 border rounded-lg p-3">
            <FilterControls
              filters={storedFilters}
              setFilters={setStoredFilters}
              defaultFilters={defaultTaskBoardFilters}
            />
          </div>
        )}
      </div>
      )}

      {focusView === "todolist" && (
        <TodolistView
          tasks={tasks}
          displayFilters={displayFilters}
          storedFilters={storedFilters}
          loadingFilters={loadingFilters}
          updateStatus={handleChangeStatus}
          updateDifficulty={updateDifficulty}
          updateCategory={updateCategory}
          updateTitle={(id, title) => updateTitle(id, title)}
          updateComment={updateComment}
          updateTerminationDate={updateTerminationDate}
          updateDurationInMinutes={updateDurationInMinutes}
          updateUser={handleUpdateUser}
          deleteTask={deleteTask}
          duplicateTaskStructure={duplicateTaskStructure}
          toggleUrgent={toggleUrgent}
          toggleImpact={toggleImpact}
          toggleMajorIncident={toggleMajorIncident}
          toggleSprintTarget={toggleSprintTarget}
          toggleDone={handleToggleDone}
          toggleTimer={(id, userId) => toggleTimer(id, userId || currentUserId)}
          createTask={createTask}
          onFocusOnTask={handleFocusOnTaskInternal}
          highlightedTaskId={highlightedTaskId}
          scrollTodolistRowRef={scrollTodolistRowRef}
          expandedParents={expandedParents}
          onToggleExpand={(taskId: string) => {
            setExpandedParents(prev => {
              const next = new Set(prev);
              if (next.has(taskId)) next.delete(taskId);
              else next.add(taskId);
              return next;
            });
          }}
        />
      )}

      {focusView === "flow" && (
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="flex pb-4 relative gap-6 flex-nowrap justify-start h-full overflow-x-auto">
          <svg className="pointer-events-none absolute top-0 left-0 w-full h-full" width={containerRef.current?.clientWidth || 0} height={containerRef.current?.clientHeight || 0} style={{ overflow: "visible" }}>
            {lines.map((l, i) => (
              <path key={i} d={`M ${l.x1} ${l.y1} C ${l.x1 + 40} ${l.y1}, ${l.x2 - 40} ${l.y2}, ${l.x2} ${l.y2}`} stroke="#f97316" strokeWidth="3" fill="none" />
            ))}
          </svg>

          {columns.map((col, i) => (
            <div key={i} className="relative">
              <Card className="w-72 shrink-0 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {col.parentId === "search-results" ? (
                      <Filter className="h-4 w-4 text-muted-foreground" />
                    ) : i === 0 ? (
                      <FolderTree className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <CornerDownRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span>
                      {col.parentId === "search-results"
                        ? t('taskboard.results')
                        : i === 0
                          ? t('taskboard.topTasks')
                          : map[col.parentId!]?.title || t('taskboard.subtasks')}
                    </span>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => handleAdd(i, "New task")}>
                    <Printer className="h-4 w-4 mr-1" />
                    {t('taskboard.print')}
                  </Button>
                </div>

                <div className="p-3 border-b shrink-0">
                  <div className="flex gap-2">
                    <Input
                      placeholder={i === 0 ? t('taskboard.placeholder.topTask') : t('taskboard.placeholder.subtask')}
                      onKeyDown={(e) => {
                        const target = e.target as HTMLInputElement;
                        if (e.key === "Enter" && target.value.trim()) {
                          handleAdd(i, target.value);
                          target.value = "";
                        }
                      }}
                    />
                    <Button
                      onClick={(e) => {
                        const input = (e.currentTarget.parentElement?.querySelector("input") as HTMLInputElement) || null;
                        const v = input?.value?.trim();
                        if (input && v) {
                          handleAdd(i, v);
                          input.value = "";
                        }
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div
                  className="flex-1 p-2 space-y-2 overflow-y-auto min-h-0"
                  onDragOver={(e) => {
                    e.preventDefault(); // unconditional — required for HTML5 DnD
                  }}
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData("text/task-id");
                    if (!id) return;
                    const parentId = i === 0 ? null : col.parentId!;
                    if (parentId !== undefined) reparent(id, parentId);
                  }}
                >
                  {loadingFilters ? (
                    <div className="text-xs text-muted-foreground px-2 py-6">{t('taskboard.loadingFilters')}</div>
                  ) : (() => {
                    // Apply text search filter only if this is the search results column
                    let filteredItems = col.items;
                    if (col.parentId === "search-results" && displayFilters.searchText?.trim()) {
                      // The items in this column are already pre-filtered by the global search
                      // No need to re-apply aStarTextSearch here, just use the items as is.
                    } else if (col.parentId !== "search-results" && displayFilters.searchText?.trim()) {
                      // If it's not the search results column, and there's a search text,
                      // we should not show any items in the regular columns.
                      filteredItems = [];
                    }

                    // Apply all other filters
                    const fullyFilteredItems = filteredItems.filter(task => {
                      // Apply user filter first
                      if (storedFilters.selectedUserId) {
                        if (storedFilters.selectedUserId === 'UNASSIGNED') {
                          // Show tasks with no userId or empty userId or 'unassigned' string
                          if (task.userId && task.userId !== 'unassigned') {
                            return false;
                          }
                        } else {
                          // When a user is selected, only show tasks assigned to that user
                          if (task.userId !== storedFilters.selectedUserId) {
                            return false;
                          }
                        }
                      }

                      // For subtasks, we want them to be visible when their parent task matches the filters
                      // Subtasks themselves don't have tags, so we only apply status filtering to them
                      if (task.parentId) {
                        // For subtasks, we only apply the status filter.
                        if (displayFilters.status && Array.isArray(displayFilters.status) && displayFilters.status.length > 0 && !displayFilters.status.includes(task.triageStatus)) {
                          return false;
                        }
                        // Subtasks pass all other filters (urgent, impact, etc.)
                        return true;
                      }

                      // Apply urgent filter
                      if (displayFilters.showUrgent && !task.urgent) {
                        return false;
                      }

                      // Apply impact filter
                      if (displayFilters.showImpact && !task.impact) {
                        return false;
                      }

                      // Apply major incident filter
                      if (displayFilters.showMajorIncident && !task.majorIncident) {
                        return false;
                      }

                      // Apply sprint target filter
                      if (displayFilters.showSprintTarget && !task.sprintTarget) {
                        return false;
                      }

                      // Apply difficulty filter
                      if (displayFilters.difficulty && Array.isArray(displayFilters.difficulty) && displayFilters.difficulty.length > 0 && !displayFilters.difficulty.includes(task.difficulty)) {
                        return false;
                      }

                      // Apply category filter
                      if (displayFilters.category && Array.isArray(displayFilters.category) && displayFilters.category.length > 0 && task.category && !displayFilters.category.includes(task.category)) {
                        return false;
                      }

                      // Apply status filter for top-level tasks
                      if (displayFilters.status && Array.isArray(displayFilters.status) && displayFilters.status.length > 0 && !displayFilters.status.includes(task.triageStatus)) {
                        return false;
                      }

                      // If we reach here, the task passes all active filters.
                      return true;
                    });

                    return fullyFilteredItems.length === 0 ? (
                      <div className="text-xs text-muted-foreground px-2 py-6">{t('taskboard.noItems')}</div>
                    ) : (
                      fullyFilteredItems.map((t) => (
                        <LazyCard
                          key={t.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/task-id", t.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(e) => {
                            e.preventDefault(); // unconditional — required for HTML5 DnD
                            e.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(e) => {
                            e.stopPropagation(); // prevent column drop from also firing
                            const dragId = e.dataTransfer.getData("text/task-id");
                            if (!dragId || dragId === t.id) return;
                            reparent(dragId, t.id);
                          }}
                        >
                          <TaskCard
                            ref={(el) => (cardRefs.current[t.id] = el)}
                            task={t}
                            tasks={tasks}
                            onActivate={() => {
                              if (col.parentId === "search-results") {
                                // Clear search, set path to reveal ancestry, and highlight
                                setStoredFilters(prev => ({ ...prev, searchText: "" }));
                                const newPath: string[] = [];
                                let current: Task | undefined = t;
                                while (current) {
                                  newPath.unshift(current.id);
                                  current = current.parentId ? map[current.parentId] : undefined;
                                }
                                setPath(newPath);
                                setHighlightedTaskId(t.id); // Highlight the clicked task
                              } else {
                                handleActivate(i, t.id);
                              }
                            }}
                            isActive={t.id === col.activeId}
                            isHighlighted={t.id === highlightedTaskId || t.id === col.activeId}
                            isTriageBoard={true}
                            updateStatus={handleChangeStatus}
                            updateDifficulty={updateDifficulty}
                            updateCategory={updateCategory}
                            updateTitle={async (id, title) => {
                              const parentId = await updateTitle(id, title); // Call useTasks' updateTitle
                              if (parentId) {
                                // If the updated task had a parent, re-activate the parent's path
                                const parentTask = map[parentId];
                                if (parentTask) {
                                  const newPath: string[] = [];
                                  let current: Task | undefined = parentTask;
                                  while (current) {
                                    newPath.unshift(current.id);
                                    current = current.parentId ? map[current.parentId] : undefined;
                                  }
                                  setPath(newPath); // Set path to parent's path
                                }
                              }
                            }}
                            updateUser={handleUpdateUser}
                            deleteTask={deleteTask}
                            duplicateTaskStructure={duplicateTaskStructure}
                            toggleUrgent={toggleUrgent}
                            toggleImpact={toggleImpact}
                            toggleMajorIncident={toggleMajorIncident}
                            toggleSprintTarget={toggleSprintTarget}
                            toggleTimer={handleToggleTimer}
                            toggleDone={handleToggleDone}
                            reparent={reparent}
                            onToggleOpen={(taskId, toggleAll) => {
                              const task = map[taskId];
                              if (task && task.children && task.children.length > 0) {
                                // Jump to the first child and highlight it
                                const firstChildId = task.children[0];

                                // Build full path to parent and then to first child
                                const newPath: string[] = [];
                                let current: Task | undefined = task;
                                while (current) {
                                  newPath.unshift(current.id);
                                  current = current.parentId ? map[current.parentId] : undefined;
                                }
                                // Add first child to the end
                                newPath.push(firstChildId);

                                setPath(newPath);
                                setHighlightedTaskId(firstChildId); // Highlight the first child

                                // Scroll to the highlighted child after a short delay
                                setTimeout(() => {
                                  cardRefs.current[firstChildId]?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "center",
                                  });
                                }, 100);
                              }
                            }}
                            updateComment={updateComment}
                            updateTerminationDate={updateTerminationDate}
                            updateDurationInMinutes={updateDurationInMinutes}
                            hoverEnterDelayMs={HOVER_ENTER_DELAY_MS}
                          />
                        </LazyCard>
                      ))
                    );
                  })()}
                </div>
              </Card>
            </div>
          ))}
        </div>
      </div>
      )}
    </div >
    </FocusModeOverlay>
    </React.Profiler>
  );
};

const TaskBoard: React.FC<{ focusedTaskId?: string | null; onFocusOnTask?: (taskId: string) => void }> = ({ focusedTaskId, onFocusOnTask }) => {
  return (
    <FocusModeProvider viewId="focus">
      <TaskBoardInner focusedTaskId={focusedTaskId} onFocusOnTask={onFocusOnTask} />
    </FocusModeProvider>
  );
};

export default TaskBoard;