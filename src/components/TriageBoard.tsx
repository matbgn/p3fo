import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTasks, Task, TriageStatus, Category } from "@/hooks/useTasks";
import { byId, TaskCard } from "./TaskCard";
import { Input } from "@/components/ui/input";
import { eventBus } from "@/lib/events";
import { FilterControls, Filters } from "./FilterControls";
import { aStarTextSearch } from "@/lib/a-star-search";



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
  onToggleUrgent: (id: string) => void;
  onToggleImpact: (id: string) => void;
  onToggleMajorIncident: (id: string) => void;
  onUpdateDifficulty: (id: string, difficulty: 0.5 | 1 | 2 | 3 | 5 | 8) => void;
  onUpdateCategory: (id: string, category: Category) => void;
  onUpdateTitle: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  openParents: Record<string, boolean>;
  onToggleParent: (id: string, toggleAll?: boolean) => void;
  onReparent: (id: string, parentId: string | null) => void;
  onFocusOnTask?: (taskId: string) => void;
}> = ({ title, cards, tasks, onDropTask, onChangeStatus, onUpdateCategory, onToggleUrgent, onToggleImpact, onToggleMajorIncident, onUpdateDifficulty, onUpdateTitle, onDelete, openParents, onToggleParent, onReparent, onFocusOnTask }) => {
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
            open={!!openParents[c.task.id]}
            onToggleOpen={(id) => onToggleParent(id, true)}
            toggleUrgent={onToggleUrgent}
            toggleImpact={onToggleImpact}
            toggleMajorIncident={onToggleMajorIncident}
            updateDifficulty={onUpdateDifficulty}
            updateTitle={onUpdateTitle}
            deleteTask={onDelete}
            duplicateTaskStructure={duplicateTaskStructure}
            toggleDone={() => {}}
            toggleTimer={() => {}}
            isTriageBoard={true}
            reparent={onReparent}
            onFocusOnTask={onFocusOnTask}
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
                    toggleUrgent={onToggleUrgent}
                    toggleImpact={onToggleImpact}
                    toggleMajorIncident={onToggleMajorIncident}
                    updateDifficulty={onUpdateDifficulty}
                    updateTitle={onUpdateTitle}
                    deleteTask={onDelete}
                    duplicateTaskStructure={duplicateTaskStructure}
                    toggleDone={() => {}}
                    toggleTimer={() => {}}
                    isTriageBoard={true}
                    reparent={onReparent}
                    onFocusOnTask={onFocusOnTask}
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

const TriageBoard: React.FC<{ onFocusOnTask?: (taskId: string) => void }> = ({ onFocusOnTask }) => {
  const { tasks, updateStatus, createTask, toggleUrgent, toggleImpact, toggleMajorIncident, updateDifficulty, updateCategory, updateTitle, deleteTask, duplicateTaskStructure, reparent } = useTasks();
  const [filters, setFilters] = React.useState<Filters>({
    showUrgent: false,
    showImpact: false,
    showMajorIncident: false,
    status: ["Backlog", "Ready", "WIP", "Blocked", "Done", "Dropped"], // All statuses selected by default
    searchText: ""
  });
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
    if (filters.status.length > 0) {
      filtered = filtered.filter(t => filters.status.includes(t.triageStatus));
    } else {
      // If no status is selected, show no tasks
      filtered = [];
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

    // Order: parents first, then children by recency
    for (const s of STATUSES) {
      acc[s] = acc[s].sort((a, b) => {
        const at = a.kind === "parent" ? 0 : 1;
        const bt = b.kind === "parent" ? 0 : 1;
        if (at !== bt) return at - bt;
        const atime = a.kind === "parent" ? a.task.createdAt : a.task.createdAt;
        const btime = b.kind === "parent" ? b.task.createdAt : b.task.createdAt;
        return btime - atime;
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
          defaultFilters={{
            status: ["Backlog", "Ready", "WIP", "Blocked", "Done", "Dropped"]
          }}
        />
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
            onToggleUrgent={toggleUrgent}
            onToggleImpact={toggleImpact}
            onToggleMajorIncident={toggleMajorIncident}
            onUpdateDifficulty={updateDifficulty}
            onUpdateTitle={updateTitle}
            onDelete={deleteTask}
            openParents={openParents}
            onToggleParent={toggleParent}
            onReparent={reparent}
            onFocusOnTask={onFocusOnTask}
          />
        ))}
      </div>
    </div>
  );
};

export default TriageBoard;
