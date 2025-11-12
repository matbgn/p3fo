import React, { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTasks, Task, TriageStatus, Category } from "@/hooks/useTasks";
import { byId, TaskCard } from "./TaskCard";
import { Input } from "@/components/ui/input";
import { eventBus } from "@/lib/events";
import { FilterControls, Filters } from "./FilterControls";
import { aStarTextSearch } from "@/lib/a-star-search";
import { loadFiltersFromSessionStorage } from "@/lib/filter-storage";
import { sortTasks } from "@/utils/taskSorting";
import { QuickTimer } from "@/components/QuickTimer";

type BoardCard =
  | { kind: "parent"; task: Task }
  | { kind: "child"; task: Task; parent: Task };

const STATUSES: TriageStatus[] = ["Backlog", "Ready", "WIP", "Blocked", "Done", "Dropped"];

// Column renders a mixture of single cards and grouped children for expanded parents
const Column: React.FC<{
  title: TriageStatus;
  cards: BoardCard[];
  tasks: Task[];
  onDropTask: (taskId: string, status: TriageStatus) => void;
  onChangeStatus: (id: string, s: TriageStatus) => void;
  onUpdateCategory: (id: string, category: Category) => void;
  onUpdateUser: (id: string, userId: string | undefined) => void;
  onToggleUrgent: (id: string) => void;
  onToggleImpact: (id: string) => void;
  onToggleMajorIncident: (id: string) => void;
  onToggleDone: (task: Task) => void;
  onUpdateDifficulty: (id: string, difficulty: 0.5 | 1 | 2 | 3 | 5 | 8) => void;
  onUpdateTitle: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  duplicateTaskStructure: (taskId: string) => string | null;
  openParents: Record<string, boolean>;
  onToggleParent: (id: string, toggleAll?: boolean) => void;
  onReparent: (id: string, parentId: string | null) => void;
  onFocusOnTask?: (taskId: string) => void;
  updateTerminationDate: (id: string, terminationDate: number | undefined) => void;
  updateDurationInMinutes: (id: string, durationInMinutes: number | undefined) => void;
  updateComment: (id: string, comment: string) => void;
  onToggleTimer: (id: string) => void;
}> = ({ title, cards, tasks, onDropTask, onChangeStatus, onUpdateCategory, onUpdateUser, onToggleUrgent, onToggleImpact, onToggleMajorIncident, onToggleDone, onUpdateDifficulty, onUpdateTitle, onDelete, duplicateTaskStructure, openParents, onToggleParent, onReparent, onFocusOnTask, updateTerminationDate, updateDurationInMinutes, updateComment, onToggleTimer }) => {
  // Build render blocks: either a single ParentCard/ChildCard or a group block for open parent children
  type Block =
    | { type: "single"; node: React.ReactNode; key: string }
    | { type: "group"; key: string; parent: Task; children: Array<{ task: Task; parent: Task }> };

  const blocks: Block[] = [];
  const groupedChildren = new Map<string, Array<{ task: Task; parent: Task }>>();

  for (const c of cards) {
    if (c.kind === "parent") {
      blocks.push({
        type: "single",
        key: `p-${c.task.id}`,
        node: (
          <TaskCard
            key={`p-${c.task.id}`}
            task={c.task}
            tasks={tasks}
            updateStatus={onChangeStatus}
            updateCategory={onUpdateCategory}
            updateUser={onUpdateUser}
            open={!!openParents[c.task.id]}
            onToggleOpen={(id) => onToggleParent(id, true)}
            toggleUrgent={onToggleUrgent}
            toggleImpact={onToggleImpact}
            toggleMajorIncident={onToggleMajorIncident}
            updateDifficulty={onUpdateDifficulty}
            updateTitle={onUpdateTitle}
            deleteTask={onDelete}
            duplicateTaskStructure={duplicateTaskStructure}
            toggleDone={() => onToggleDone(c.task)}
            toggleTimer={onToggleTimer}
            isTriageBoard={true}
            reparent={onReparent}
            onFocusOnTask={onFocusOnTask}
            updateTerminationDate={updateTerminationDate}
            updateDurationInMinutes={updateDurationInMinutes}
            updateComment={updateComment}
          />
        ),
      });
    } else {
      // Only consider children if their parent is currently open; otherwise omit them entirely
      const pid = c.parent.id;
      if (!openParents[pid]) {
        continue;
      }
      const key = `${pid}-${title}`;
      if (!groupedChildren.has(key)) groupedChildren.set(key, []);
      groupedChildren.get(key)!.push({ task: c.task, parent: c.parent });
    }
  }

  // Interleave groups right after their parent card
  const finalBlocks: Block[] = [];
  const pendingGroups = new Map(groupedChildren);
  for (const b of blocks) {
    finalBlocks.push(b);
    const m = b.type === "single" ? /^p-(.+)$/.exec(b.key) : null;
    if (m) {
      const parentId = m[1];
      const groupKey = `${parentId}-${title}`;
      if (pendingGroups.has(groupKey)) {
        const children = pendingGroups.get(groupKey)!;
        const parent = children[0].parent;
        finalBlocks.push({
          type: "group",
          key: `g-${groupKey}`,
          parent,
          children,
        });
        pendingGroups.delete(groupKey);
      }
    }
  }
  // Groups whose parent isn't visible in this column are still shown at the top for visibility
  for (const [gkey, children] of pendingGroups) {
    finalBlocks.unshift({
      type: "group",
      key: `g-${gkey}`,
      parent: children[0].parent,
      children,
    });
  }

  const onDragOver: React.DragEventHandler = (e) => {
    if (e.dataTransfer.types.includes("text/task-id")) e.preventDefault();
  };
  const onDrop: React.DragEventHandler = (e) => {
    const id = e.dataTransfer.getData("text/task-id");
    if (id) onDropTask(id, title);
  };

  return (
    <Card className="w-80 shrink-0 overflow-hidden">
      <div className="px-3 py-2 border-b text-sm font-medium">{title}</div>
      <div className="p-2 space-y-2 min-h-[320px]" onDragOver={onDragOver} onDrop={onDrop}>
        {finalBlocks.length === 0 ? (
          <div className="text-xs text-muted-foreground px-2 py-6">No tasks</div>
        ) : (
          finalBlocks.map((blk) =>
            blk.type === "single" ? (
              <div key={blk.key}>{blk.node}</div>
            ) : (
              <div
                key={blk.key}
                className="rounded-md border border-blue-300/60 bg-blue-50/50 dark:bg-blue-950/20 p-2 space-y-2"
              >
                <div className="text-xs font-medium text-blue-700 dark:text-blue-300 px-1">
                  Subtasks of: {blk.parent.title}
                </div>
                {blk.children.map(({ task, parent }) => (
                  <TaskCard
                    key={`gc-${task.id}`}
                    task={task}
                    tasks={tasks}
                    updateStatus={onChangeStatus}
                    updateCategory={onUpdateCategory}
                    updateUser={onUpdateUser}
                    toggleUrgent={onToggleUrgent}
                    toggleImpact={onToggleImpact}
                    toggleMajorIncident={onToggleMajorIncident}
                    updateDifficulty={onUpdateDifficulty}
                    updateTitle={onUpdateTitle}
                    deleteTask={onDelete}
                    duplicateTaskStructure={duplicateTaskStructure}
                    toggleDone={() => onToggleDone(task)}
                    toggleTimer={onToggleTimer}
                    isTriageBoard={true}
                    reparent={onReparent}
                    onFocusOnTask={onFocusOnTask}
                    updateTerminationDate={updateTerminationDate}
                    updateDurationInMinutes={updateDurationInMinutes}
                    updateComment={updateComment}
                  />
                ))}
              </div>
            ),
          )
        )}
      </div>
    </Card>
  );
};

const KanbanBoard: React.FC<{ onFocusOnTask?: (taskId: string) => void }> = ({ onFocusOnTask }) => {
  const { tasks, updateStatus, createTask, toggleUrgent, toggleImpact, toggleMajorIncident, updateDifficulty, updateCategory, updateTitle, updateUser, deleteTask, duplicateTaskStructure, reparent, toggleDone, toggleTimer, updateTerminationDate, updateDurationInMinutes, updateComment } = useTasks();

  const defaultKanbanFilters: Filters = {
    showUrgent: false,
    showImpact: false,
    showMajorIncident: false,
    status: ["Backlog", "Ready", "WIP", "Blocked", "Done", "Dropped"], // All statuses selected by default
    searchText: "",
    difficulty: [],
    category: []
  };

  const [filters, setFilters] = React.useState<Filters>(defaultKanbanFilters);
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

  const map = React.useMemo(() => byId(tasks), [tasks]);
  const topTasks = React.useMemo(() => {
    let filtered = tasks.filter((t) => !t.parentId);
    
    // Apply text search filter using A* algorithm
    if (filters.searchText?.trim()) {
      const searchResults = aStarTextSearch(filters.searchText, filtered.map(t => ({ id: t.id, title: t.title })));
      const matchingTaskIds = new Set(searchResults.filter(r => r.score >= 0.001).map(r => r.taskId));
      filtered = filtered.filter(t => matchingTaskIds.has(t.id));
    }
    
    if (filters.showUrgent) filtered = filtered.filter(t => t.urgent);
    if (filters.showImpact) filtered = filtered.filter(t => t.impact);
    if (filters.showMajorIncident) filtered = filtered.filter(t => t.majorIncident);
    if (filters.difficulty && Array.isArray(filters.difficulty) && filters.difficulty.length > 0) {
      filtered = filtered.filter(t => filters.difficulty.includes(t.difficulty));
    }
    if (filters.category && Array.isArray(filters.category) && filters.category.length > 0) {
      filtered = filtered.filter(t => !t.category || filters.category.includes(t.category));
    }
    if (filters.status && Array.isArray(filters.status) && filters.status.length > 0) {
      filtered = filtered.filter(t => filters.status.includes(t.triageStatus));
    }
    return filtered;
  }, [tasks, filters]);

  // Track which parents are expanded; default: collapsed (no children shown)
  const [openParents, setOpenParents] = React.useState<Record<string, boolean>>({});
  const toggleParent = (id: string, toggleAll = false) => {
    setOpenParents((p) => {
      const isOpen = !p[id];
      const newOpen = { ...p, [id]: isOpen };

      if (toggleAll) {
        const traverse = (taskId: string) => {
          const task = map[taskId];
          if (task && task.children) {
            task.children.forEach((childId) => {
              newOpen[childId] = isOpen;
              traverse(childId);
            });
          }
        };
        traverse(id);
      }

      return newOpen;
    });
  };

  // Force re-render when timer updates or tasks change
  const [, setForceRender] = React.useState({});
  React.useEffect(() => {
    const onTimerToggled = () => {
      setForceRender({});
    };
    
    const onTasksChanged = () => {
      setForceRender({});
    };
    
    eventBus.subscribe("timerToggled", onTimerToggled);
    eventBus.subscribe("tasksChanged", onTasksChanged);
    return () => {
      eventBus.unsubscribe("timerToggled", onTimerToggled);
      eventBus.unsubscribe("tasksChanged", onTasksChanged);
    };
  }, []);

  // Build cards per column: parents always included in their status column.
  // Children are included ONLY if their parent is open (handled inside Column via openParents).
  const grouped = React.useMemo(() => {
    const acc: Record<TriageStatus, BoardCard[]> = {
      Backlog: [],
      Ready: [],
      WIP: [],
      Blocked: [],
      Done: [],
      Dropped: [],
    };

    for (const parent of topTasks) {
      acc[parent.triageStatus].push({ kind: "parent", task: parent });
    }
    // Recursively find all children and add them to the dataset
    const getAllChildren = (task: Task) => {
      let children: Task[] = [];
      if (task.children) {
        for (const childId of task.children) {
          const child = map[childId];
          if (child) {
            children.push(child);
            children = children.concat(getAllChildren(child));
          }
        }
      }
      return children;
    };

    for (const parent of topTasks) {
      const allChildren = getAllChildren(parent);
      for (const child of allChildren) {
        acc[child.triageStatus].push({ kind: "child", task: child, parent });
      }
    }

    // Order: parents first, then children by priority (urgent, impact, deadline, recency)
    for (const s of STATUSES) {
      acc[s] = acc[s].sort((a, b) => {
        // Use the same sorting logic as TaskBoard.tsx for consistency
        const sortResult = sortTasks.kanban(a.task, b.task);
        if (sortResult !== 0) return sortResult;

        // If tasks are equal in priority, maintain parent-child ordering
        const at = a.kind === "parent" ? 0 : 1;
        const bt = b.kind === "parent" ? 0 : 1;
        if (at !== bt) return at - bt;
        return 0;
      });
    }

    return acc;  
  }, [topTasks, map, tasks]); // Added tasks as dependency to ensure re-render when tasks change

  // Quick add
  const [input, setInput] = React.useState("");
  const addTopTask = () => {
    const v = input.trim();
    if (!v) return;
    createTask(v, null);
    setInput("");
  };

  return (
    <div className="w-full overflow-x-auto">
      <div className="mb-4 flex gap-2">
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

      <div className="flex flex-wrap items-center gap-4 border rounded-lg p-3 mb-4">
        <FilterControls
          filters={filters}
          setFilters={setFilters}
          defaultFilters={defaultKanbanFilters}
        />
        {/* Vertical separator */}
        <div className="h-6 border-l border-gray-300 mx-2"></div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Quick time edition:</span>
          <QuickTimer onJumpToTask={(taskId) => {
            // Find the task and focus on it
            const task = tasks.find(t => t.id === taskId);
            if (task) {
              onFocusOnTask?.(taskId);
            }
          }} />
        </div>
      </div>
 
       <div className="flex gap-4 pb-4">
         {STATUSES.map((s) => (
           <Column
            key={s}
            title={s}
            cards={grouped[s]}
            tasks={tasks}
            onDropTask={(id, status) => updateStatus(id, status)}
            onChangeStatus={(id, status) => updateStatus(id, status)}
            onUpdateCategory={(id, category) => updateCategory(id, category)}
            onUpdateUser={(id, userId) => updateUser(id, userId)}
            onToggleUrgent={toggleUrgent}
            onToggleImpact={toggleImpact}
            onToggleMajorIncident={toggleMajorIncident}
            onToggleDone={(task: Task) => toggleDone(task.id)}
            onUpdateDifficulty={updateDifficulty}
            onUpdateTitle={updateTitle}
            onDelete={deleteTask}
            duplicateTaskStructure={duplicateTaskStructure}
            openParents={openParents}
            onToggleParent={toggleParent}
            onReparent={reparent}
            onFocusOnTask={onFocusOnTask}
            onToggleTimer={toggleTimer}
            updateTerminationDate={updateTerminationDate}
            updateDurationInMinutes={updateDurationInMinutes}
            updateComment={updateComment}
          />
        ))}
      </div>
    </div>
  );
};

export default KanbanBoard;
