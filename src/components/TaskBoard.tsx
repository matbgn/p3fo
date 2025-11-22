import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, CornerDownRight, FolderTree, Printer, Filter } from "lucide-react";
import { FilterControls, Filters } from "./FilterControls";
import { useTasks, Task, TriageStatus } from "@/hooks/useTasks";
import { useUserSettings } from "@/hooks/useUserSettings";
import { QuickTimer } from "@/components/QuickTimer";
import { aStarTextSearch } from "@/lib/a-star-search";
import { loadFiltersFromSessionStorage } from "@/lib/filter-storage";
import { sortTasks } from "@/utils/taskSorting";

import { TaskCard } from "./TaskCard";
import { byId } from "@/lib/utils";

type Column = {
  parentId: string | null;
  items: Task[];
  activeId?: string;
};

const TaskBoard: React.FC<{ focusedTaskId?: string | null }> = ({ focusedTaskId }) => {
  const { tasks, createTask, reparent, updateStatus, toggleUrgent, toggleImpact, toggleMajorIncident, updateDifficulty, updateTitle, updateUser, deleteTask, duplicateTaskStructure, toggleDone, updateTaskTimer, toggleTimer, updateTimeEntry, updateCategory, updateComment, updateTerminationDate, updateDurationInMinutes } = useTasks();
  const { userId: currentUserId } = useUserSettings();
  const map = React.useMemo(() => byId(tasks), [tasks]);

  const [path, setPath] = React.useState<string[]>([]);
  const [highlightedTaskId, setHighlightedTaskId] = React.useState<string | null>(null);

  const defaultTaskBoardFilters: Filters = {
    showUrgent: false,
    showImpact: false,
    showMajorIncident: false,
    status: ["Backlog", "Ready", "WIP", "Blocked"], // All non-Done, non-Dropped statuses by default
    searchText: "",
    difficulty: [],
    category: []
  };

  const [filters, setFilters] = React.useState<Filters>(defaultTaskBoardFilters);
  const [loadingFilters, setLoadingFilters] = React.useState(true);

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

  // Effect to update session storage when filters change
  useEffect(() => {
    // The FilterControls component now handles saving filters to session storage
    // No need to save here directly, as setFilters is passed to FilterControls
  }, [filters]);

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
    if (filters.searchText?.trim()) {
      const allSearchableTasks = tasks.flatMap(task => {
        // Include parent tasks and their children for search
        return [{ id: task.id, title: task.title }];
      });

      const searchResults = aStarTextSearch(filters.searchText, allSearchableTasks);
      const matchingTaskIds = new Set(searchResults.filter(r => r.score >= 0.001).map(r => r.taskId));

      const searchResultTasks = tasks.filter(task => matchingTaskIds.has(task.id));

      cols.push({
        parentId: "search-results", // Unique ID for search results column
        items: searchResultTasks.sort(sortTasks.taskboard),
        activeId: null, // No active task in search results column
      });
    }

    const rootItems = tasks.filter((t) => !t.parentId).sort(sortTasks.taskboard);
    cols.push({ parentId: null, items: rootItems, activeId: path[0] });

    path.forEach((taskId, idx) => {
      const t = map[taskId];
      if (!t) return;
      // Show all children to ensure tasks from other columns are visible
      const children = ((t.children || [])
        .map((id) => map[id])
        .filter(Boolean) as Task[]).sort(sortTasks.taskboard);
      cols.push({
        parentId: t.id,
        items: children,
        activeId: path[idx + 1],
      });
    });
    return cols;
    return cols;
  }, [tasks, map, path, filters]);

  const handleActivate = (colIndex: number, id: string) => {
    const newPath = path.slice(0, colIndex);
    newPath[colIndex] = id;
    setPath(newPath);
    setHighlightedTaskId(null); // Clear highlighted task on normal activation
  };

  const handleAdd = async (colIndex: number, title: string) => {
    const parentId = colIndex === 0 ? null : columns[colIndex].parentId!;
    const newId = await createTask(title, parentId);
    handleActivate(colIndex, newId);
  };

  // Sync kanban status with done when changed via dropdown
  const handleChangeStatus = React.useCallback(
    (taskId: string, status: TriageStatus) => {
      updateStatus(taskId, status);
    },
    [updateStatus],
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

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-4 border rounded-lg p-3">
          <FilterControls
            filters={filters}
            setFilters={setFilters}
            defaultFilters={defaultTaskBoardFilters}
          />
          {/* Vertical separator */}
          <div className="h-6 border-l border-gray-300 mx-2"></div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Quick time edition:</span>
            <QuickTimer onJumpToTask={(taskId) => {
              // Find the task and activate its path
              const task = map[taskId];
              if (task) {
                const newPath: string[] = [];
                let current: Task | undefined = task;
                while (current) {
                  newPath.unshift(current.id);
                  current = current.parentId ? map[current.parentId] : undefined;
                }
                setPath(newPath);
              }
            }} />
          </div>
        </div>


      </div>

      <div className="relative">
        <div ref={containerRef} className="flex pb-4 relative gap-6 flex-nowrap justify-start">
          <svg className="pointer-events-none absolute top-0 left-0 w-full h-full" width={containerRef.current?.clientWidth || 0} height={containerRef.current?.clientHeight || 0} style={{ overflow: "visible" }}>
            {lines.map((l, i) => (
              <path key={i} d={`M ${l.x1} ${l.y1} C ${l.x1 + 40} ${l.y1}, ${l.x2 - 40} ${l.y2}, ${l.x2} ${l.y2}`} stroke="#f97316" strokeWidth="3" fill="none" />
            ))}
          </svg>

          {columns.map((col, i) => (
            <div key={i} className="relative">
              <Card className="w-72 shrink-0 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b">
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
                        ? "Results"
                        : i === 0
                          ? "Top tasks"
                          : map[col.parentId!]?.title || "Subtasks"}
                    </span>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => handleAdd(i, "New task")}>
                    <Printer className="h-4 w-4 mr-1" />
                    Print
                  </Button>
                </div>

                <div className="p-3 border-b">
                  <div className="flex gap-2">
                    <Input
                      placeholder={i === 0 ? "New top task..." : "New subtask..."}
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
                  className="p-2 space-y-2 min-h-[280px]"
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes("text/task-id")) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData("text/task-id");
                    if (!id) return;
                    const parentId = i === 0 ? null : col.parentId!;
                    if (parentId !== undefined) reparent(id, parentId);
                  }}
                >
                  {loadingFilters ? (
                    <div className="text-xs text-muted-foreground px-2 py-6">Loading filters...</div>
                  ) : (() => {
                    // Apply text search filter only if this is the search results column
                    let filteredItems = col.items;
                    if (col.parentId === "search-results" && filters.searchText?.trim()) {
                      // The items in this column are already pre-filtered by the global search
                      // No need to re-apply aStarTextSearch here, just use the items as is.
                    } else if (col.parentId !== "search-results" && filters.searchText?.trim()) {
                      // If it's not the search results column, and there's a search text,
                      // we should not show any items in the regular columns.
                      filteredItems = [];
                    }

                    // Apply all other filters
                    const fullyFilteredItems = filteredItems.filter(task => {
                      // Apply user filter first
                      // Apply user filter first
                      if (filters.selectedUserId) {
                        if (filters.selectedUserId === 'UNASSIGNED') {
                          // Show tasks with no userId or empty userId or 'unassigned' string
                          if (task.userId && task.userId !== 'unassigned') {
                            return false;
                          }
                        } else {
                          // When a user is selected, only show tasks assigned to that user
                          if (task.userId !== filters.selectedUserId) {
                            return false;
                          }
                        }
                      }

                      // For subtasks, we want them to be visible when their parent task matches the filters
                      // Subtasks themselves don't have tags, so we only apply status filtering to them
                      if (task.parentId) {
                        // For subtasks, we only apply the status filter.
                        if (filters.status && Array.isArray(filters.status) && filters.status.length > 0 && !filters.status.includes(task.triageStatus)) {
                          return false;
                        }
                        // Subtasks pass all other filters (urgent, impact, etc.)
                        return true;
                      }

                      // 2. Apply urgent filter (applies to all tasks that passed the done filter)
                      if (filters.showUrgent && !task.urgent) {
                        return false;
                      }

                      // 3. Apply impact filter (applies to all tasks that passed the done and urgent filters)
                      if (filters.showImpact && !task.impact) {
                        return false;
                      }

                      // 4. Apply major incident filter (applies to all tasks that passed the previous filters)
                      if (filters.showMajorIncident && !task.majorIncident) {
                        return false;
                      }

                      // Apply difficulty filter
                      if (filters.difficulty && Array.isArray(filters.difficulty) && filters.difficulty.length > 0 && !filters.difficulty.includes(task.difficulty)) {
                        return false;
                      }

                      // Apply category filter
                      // Tasks without a category should be displayed if any category is selected.
                      // Tasks with a category should only be displayed if their category is selected.
                      if (filters.category && Array.isArray(filters.category) && filters.category.length > 0 && task.category && !filters.category.includes(task.category)) {
                        return false;
                      }

                      // 5. Apply status filter (multiselect) for all tasks
                      // If filters.status is empty, show all tasks (no filtering).
                      // If filters.status has values, only show tasks with matching statuses.
                      if (filters.status && Array.isArray(filters.status) && filters.status.length > 0 && !filters.status.includes(task.triageStatus)) {
                        return false;
                      }

                      // If we reach here, the task passes all active filters.
                      return true;
                    });

                    return fullyFilteredItems.length === 0 ? (
                      <div className="text-xs text-muted-foreground px-2 py-6">No items yet.</div>
                    ) : (
                      fullyFilteredItems.map((t) => (
                        <TaskCard
                          ref={(el) => (cardRefs.current[t.id] = el)}
                          key={t.id}
                          task={t}
                          tasks={tasks}
                          onActivate={() => {
                            if (col.parentId === "search-results") {
                              // Clear search, set path to reveal ancestry, and highlight
                              setFilters(prev => ({ ...prev, searchText: "" }));
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
                          isHighlighted={t.id === highlightedTaskId}
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
                          updateUser={(id, userId) => updateUser(id, userId === 'current-user' ? currentUserId : userId)}
                          deleteTask={deleteTask}
                          duplicateTaskStructure={duplicateTaskStructure}
                          toggleUrgent={toggleUrgent}
                          toggleImpact={toggleImpact}
                          toggleMajorIncident={toggleMajorIncident}
                          toggleTimer={toggleTimer}
                          toggleDone={(task) => toggleDone(task.id)}
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
                        />
                      ))
                    );
                  })()}
                </div>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TaskBoard;