import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, CornerDownRight, FolderTree, Printer, Filter } from "lucide-react";
import { FilterControls, Filters } from "./FilterControls";
import { useTasks, Task, TriageStatus } from "@/hooks/useTasks";
import { QuickTimer } from "@/components/QuickTimer";
import { aStarTextSearch } from "@/lib/a-star-search";

import { byId, TaskCard } from "./TaskCard";

const sortTasks = (a: Task, b: Task) => {
  // 1. Done tasks at the bottom
  if (a.done && !b.done) return 1;
  if (!a.done && b.done) return -1;

  // 2. Blocked tasks
  const aIsBlocked = a.triageStatus === 'Blocked';
  const bIsBlocked = b.triageStatus === 'Blocked';
  if (aIsBlocked && !bIsBlocked) return 1;
  if (!aIsBlocked && bIsBlocked) return -1;

  // 3. Urgency and Impact
  const aScore = (a.urgent ? 2 : 0) + (a.impact ? 1 : 0);
  const bScore = (b.urgent ? 2 : 0) + (b.impact ? 1 : 0);

  if (aScore !== bScore) {
    return bScore - aScore;
  }

  // 4. Fallback to creation time
  return a.createdAt - b.createdAt;
};

type Column = {
  parentId: string | null;
  items: Task[];
  activeId?: string;
};

const TaskBoard: React.FC<{ focusedTaskId?: string | null }> = ({ focusedTaskId }) => {
  const { tasks, createTask, reparent, updateStatus, toggleUrgent, toggleImpact, toggleMajorIncident, updateDifficulty, updateTitle, deleteTask, duplicateTaskStructure, toggleDone, updateTaskTimer, toggleTimer, updateTimeEntry, updateCategory } = useTasks();
  const map = React.useMemo(() => byId(tasks), [tasks]);

  const [path, setPath] = React.useState<string[]>([]);
  const [filters, setFilters] = React.useState<Filters>({
    showUrgent: false,
    showImpact: false,
    showMajorIncident: false,
    status: ["Backlog", "Ready", "WIP", "Blocked"], // All non-Done, non-Dropped statuses by default
    showDone: false, // Done tasks are hidden by default (negative filter)
    searchText: ""
  });
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
    const rootItems = tasks.filter((t) => !t.parentId).sort(sortTasks);
    cols.push({ parentId: null, items: rootItems, activeId: path[0] });

    path.forEach((taskId, idx) => {
      const t = map[taskId];
      if (!t) return;
      // Show all children to ensure tasks from other columns are visible
      const children = ((t.children || [])
        .map((id) => map[id])
        .filter(Boolean) as Task[]).sort(sortTasks);
      cols.push({
        parentId: t.id,
        items: children,
        activeId: path[idx + 1],
      });
    });
    return cols;
  }, [tasks, map, path]);

  const handleActivate = (colIndex: number, id: string) => {
    const newPath = path.slice(0, colIndex);
    newPath[colIndex] = id;
    setPath(newPath);
  };

  const handleAdd = (colIndex: number, title: string) => {
    const parentId = colIndex === 0 ? null : columns[colIndex].parentId!;
    const newId = createTask(title, parentId);
    handleActivate(colIndex, newId);
  };

  // Sync triage status with done when changed via dropdown
  const handleChangeStatus = React.useCallback(
    (taskId: string, status: TriageStatus) => {
      updateStatus(taskId, status);
    },
    [updateStatus],
  );

  // Checkbox behavior:
  // - If checking (was not done): set done=true and triageStatus="Done".
  // - If unchecking (was done): set done=false and triageStatus="WIP".
  const handleToggleDoneSmart = React.useCallback(
    (task: Task) => {
      const willBeDone = !task.done;
      if (willBeDone) {
        toggleDone(task.id);
      } else {
        toggleDone(task.id);
      }
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

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-4 border rounded-lg p-3">
          <FilterControls 
            filters={filters} 
            setFilters={setFilters} 
            defaultFilters={{
              status: ["Backlog", "Ready", "WIP", "Blocked"]
            }}
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
                    {i === 0 ? <FolderTree className="h-4 w-4 text-muted-foreground" /> : <CornerDownRight className="h-4 w-4 text-muted-foreground" />}
                    <span>{i === 0 ? "Top tasks" : (map[col.parentId!]?.title || "Subtasks")}</span>
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
                  {(() => {
                    // Apply text search filter using A* algorithm to all items first
                    let filteredItems = col.items;
                    if (filters.searchText?.trim()) {
                      const searchResults = aStarTextSearch(filters.searchText, col.items.map(task => ({ id: task.id, title: task.title })));
                      const matchingTaskIds = new Set(searchResults.filter(r => r.score >= 0.001).map(r => r.taskId));
                      filteredItems = col.items.filter(task => matchingTaskIds.has(task.id));
                    }
                    
                    // Apply all other filters
                    const fullyFilteredItems = filteredItems.filter(task => {
                      // For subtasks, we want them to be visible when their parent task matches the filters
                      // Subtasks themselves don't have tags, so we only apply status filtering to them
                      if (task.parentId) {
                        // 1. Handle 'Done' tasks first and independently
                        // If showDone is false and task is done, hide it.
                        if (!filters.showDone && task.done) {
                          return false;
                        }
                        
                        // 4. Apply status filter (multiselect) for non-Done tasks ONLY
                        // This filter should NOT apply to tasks that are 'done'.
                        if (!task.done) {
                          // If filters.status is empty, it means "show nothing", so hide all non-Done tasks.
                          // If filters.status is not empty, then check if the task's triageStatus is included.
                          if (filters.status.length > 0) {
                            if (!filters.status.includes(task.triageStatus)) {
                              return false;
                            }
                          } else {
                            return false;
                          }
                        }
                        
                        // Subtasks pass all other filters by default since they don't have tags
                        return true;
                      }
                      
                      // For top-level tasks, apply all filters normally
                      // 1. Handle 'Done' tasks first and independently
                      // If showDone is false and task is done, hide it.
                      if (!filters.showDone && task.done) {
                        return false;
                      }
                      // If task is done and showDone is true, it passes the 'done' filter.
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

                      // 5. Apply status filter (multiselect) for all tasks
                      // If filters.status is empty, it means "show nothing", so hide all tasks.
                      // If filters.status is not empty, then check if the task's triageStatus is included.
                      if (filters.status.length > 0) {
                        if (!filters.status.includes(task.triageStatus)) {
                          return false;
                        }
                      } else {
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
                          onActivate={() => handleActivate(i, t.id)}
                          isActive={t.id === col.activeId}
                          updateStatus={handleChangeStatus}
                          updateDifficulty={updateDifficulty}
                          updateCategory={updateCategory}
                          updateTitle={(id, title) => {
                            const parentId = updateTitle(id, title); // Call useTasks' updateTitle
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
                          deleteTask={deleteTask}
                          duplicateTaskStructure={duplicateTaskStructure}
                          toggleUrgent={toggleUrgent}
                          toggleImpact={toggleImpact}
                          toggleMajorIncident={toggleMajorIncident}
                          toggleDone={handleToggleDoneSmart}
                          toggleTimer={toggleTimer}
                          reparent={reparent}
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