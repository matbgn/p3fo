import React, { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTasks, Task, TriageStatus, Category } from "@/hooks/useTasks";
import { TaskCard } from "./TaskCard";
import { byId } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { eventBus } from "@/lib/events";
import { FilterControls, Filters } from "./FilterControls";
import { aStarTextSearch } from "@/lib/a-star-search";
import { loadFiltersFromSessionStorage } from "@/lib/filter-storage";
import { sortTasks } from "@/utils/taskSorting";
import { QuickTimer } from "@/components/QuickTimer";

import { useUserSettings } from "@/hooks/useUserSettings";
import { useViewNavigation, useViewDisplay } from "@/hooks/useView";
import { COMPACTNESS_ULTRA, COMPACTNESS_FULL } from "@/context/ViewContextDefinition";
import { ChevronDown, ChevronRight, Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useCombinedSettings } from "@/hooks/useCombinedSettings";

type BoardCard =
  | { kind: "parent"; task: Task }
  | { kind: "child"; task: Task; parent: Task };

import { LazyCard } from "./LazyCard";

const STATUSES: TriageStatus[] = ["Backlog", "Ready", "WIP", "Blocked", "Done", "Dropped", "Archived"];

// Column renders a mixture of single cards and grouped children for expanded parents
// Wrapped in React.memo to only re-render when its specific cards/props change
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
  duplicateTaskStructure: (taskId: string) => Promise<string | null>;
  openParents: Record<string, boolean>;
  onToggleParent: (id: string, toggleAll?: boolean) => void;
  onReparent: (id: string, parentId: string | null) => void;
  onFocusOnTask?: (taskId: string) => void;
  updateTerminationDate: (id: string, terminationDate: number | undefined) => void;
  updateDurationInMinutes: (id: string, durationInMinutes: number | undefined) => void;
  updateComment: (id: string, comment: string) => void;
  onToggleTimer: (id: string) => void;
  highlightedTaskId?: string | null;
  highlightedCardRef?: React.RefObject<HTMLDivElement | null>;
  onArchive?: (title: TriageStatus) => void;
}> = React.memo(({ title, cards, tasks, onDropTask, onChangeStatus, onUpdateCategory, onUpdateUser, onToggleUrgent, onToggleImpact, onToggleMajorIncident, onToggleDone, onUpdateDifficulty, onUpdateTitle, onDelete, duplicateTaskStructure, openParents, onToggleParent, onReparent, onFocusOnTask, updateTerminationDate, updateDurationInMinutes, updateComment, onToggleTimer, highlightedTaskId, highlightedCardRef, onArchive }) => {
  // Calculate total difficulty points for this column
  const totalDifficulty = cards.reduce((sum, card) => sum + (card.task.difficulty || 0), 0);

  // Build render blocks: either a single ParentCard/ChildCard or a group block for open parent children
  type Block =
    | { type: "single"; node: React.ReactNode; key: string }
    | { type: "group"; key: string; parent: Task; children: Array<{ task: Task; parent: Task }> };

  const blocks: Block[] = [];
  const groupedChildren = new Map<string, Array<{ task: Task; parent: Task }>>();

  for (const c of cards) {
    if (c.kind === "parent") {
      const isHighlighted = highlightedTaskId === c.task.id;
      blocks.push({
        type: "single",
        key: `p-${c.task.id}`,
        node: (
          <div ref={isHighlighted ? highlightedCardRef : undefined}>
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
              isHighlighted={isHighlighted}
            />
          </div>
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
      <div className="px-3 py-2 border-b text-sm font-medium flex items-center justify-between">
        <span>{title === "WIP" ? "Work in Progress [MAX 5/p]" : title}</span>
        <div className="flex items-center gap-2">
          {totalDifficulty > 0 && (
            <Badge variant="secondary" className="ml-2">
              {totalDifficulty} pts
            </Badge>
          )}
          {(title === "Done" || title === "Dropped") && cards.length > 0 && onArchive && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => onArchive(title)}
              title={`Archive all ${cards.length} cards in ${title}`}
            >
              <Archive className="h-3 w-3 mr-1" />
              Archive ({cards.length})
            </Button>
          )}
        </div>
      </div>
      <div className="p-2 space-y-2 min-h-[320px]" onDragOver={onDragOver} onDrop={onDrop}>
        {finalBlocks.length === 0 ? (
          <div className="text-xs text-muted-foreground px-2 py-6">No tasks</div>
        ) : (
          finalBlocks.map((blk) =>
            blk.type === "single" ? (
              <LazyCard key={blk.key}>{blk.node}</LazyCard>
            ) : (
              <LazyCard
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
              </LazyCard>
            ),
          )
        )}
      </div>
    </Card>
  );
});

// Isolated quick-add input to prevent full board re-renders on every keystroke
const QuickAddInput: React.FC<{ onAdd: (title: string, userId?: string) => void; selectedUserId?: string }> = React.memo(({ onAdd, selectedUserId }) => {
  const [input, setInput] = React.useState("");
  const addTopTask = () => {
    const v = input.trim();
    if (!v) return;
    const assignedUserId = selectedUserId && selectedUserId !== 'UNASSIGNED' ? selectedUserId : undefined;
    onAdd(v, assignedUserId);
    setInput("");
  };
  return (
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
  );
});

const KanbanBoard: React.FC<{ onFocusOnTask?: (taskId: string) => void; highlightedTaskId?: string | null }> = ({ onFocusOnTask, highlightedTaskId }) => {
  const { tasks, updateStatus, createTask, toggleUrgent, toggleImpact, toggleMajorIncident, updateDifficulty, updateCategory, updateTitle, updateUser, deleteTask, duplicateTaskStructure, reparent, toggleDone, toggleTimer, updateTerminationDate, updateDurationInMinutes, updateComment, loadTasksByUser, reloadTasks } = useTasks();
  const { userId: currentUserId } = useUserSettings();
  const { setFocusedTaskId } = useViewNavigation();
  const { settings } = useCombinedSettings();
  const [isLoadingTasks, setIsLoadingTasks] = React.useState(false);

  // Stable callback references for Column props (prevents Column/TaskCard re-renders)
  const handleDropTask = React.useCallback((id: string, status: TriageStatus) => {
    updateStatus(id, status);
  }, [updateStatus]);

  const handleChangeStatus = React.useCallback((id: string, status: TriageStatus) => {
    updateStatus(id, status);
  }, [updateStatus]);

  const handleUpdateCategory = React.useCallback((id: string, category: Category) => {
    updateCategory(id, category);
  }, [updateCategory]);

  const handleUpdateUser = React.useCallback((id: string, userId: string | undefined) => {
    updateUser(id, userId === 'current-user' ? currentUserId : userId);
  }, [updateUser, currentUserId]);

  const handleToggleDone = React.useCallback((task: Task) => {
    toggleDone(task.id);
  }, [toggleDone]);

  // Archive dialog state
  const [archiveDialogOpen, setArchiveDialogOpen] = React.useState(false);
  const [archiveColumnTitle, setArchiveColumnTitle] = React.useState<TriageStatus | null>(null);
  const [archiveOnlyOldCards, setArchiveOnlyOldCards] = React.useState(false);

  // Local state to manage highlighting with auto-clear
  const [localHighlightedTaskId, setLocalHighlightedTaskId] = React.useState<string | null>(null);
  const highlightedCardRef = React.useRef<HTMLDivElement | null>(null);

  // When highlightedTaskId changes from props, set local state and auto-clear after delay
  React.useEffect(() => {
    if (highlightedTaskId) {
      setLocalHighlightedTaskId(highlightedTaskId);
      // Auto-clear the highlight after 3 seconds
      const timer = setTimeout(() => {
        setLocalHighlightedTaskId(null);
        setFocusedTaskId(null); // Clear global state too
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightedTaskId, setFocusedTaskId]);

  // Scroll to highlighted card when it appears
  React.useEffect(() => {
    if (localHighlightedTaskId && highlightedCardRef.current) {
      highlightedCardRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center'
      });
    }
  }, [localHighlightedTaskId]);

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
  const { cardCompactness } = useViewDisplay();
  const [isFiltersCollapsed, setIsFiltersCollapsed] = React.useState(false);

  // Auto-collapse filters when switching to Ultra Compact mode
  // Auto-expand filters when switching to Full mode
  React.useEffect(() => {
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

  // Server-side filtering: reload tasks when userId filter changes
  // This dramatically improves performance by fetching only relevant tasks from the database
  const prevUserIdRef = React.useRef<string | null | undefined>(undefined);
  useEffect(() => {
    // Skip on initial render (wait for filters to load from session storage)
    if (loadingFilters) return;

    // Only reload if userId actually changed
    if (prevUserIdRef.current === filters.selectedUserId) return;
    prevUserIdRef.current = filters.selectedUserId;

    const loadFilteredTasks = async () => {
      setIsLoadingTasks(true);
      try {
        if (filters.selectedUserId) {
          // Use server-side filtering for specific user
          await loadTasksByUser(filters.selectedUserId);
        } else {
          // No user filter - reload all tasks
          await reloadTasks();
        }
      } catch (error) {
        console.error("Error loading filtered tasks:", error);
      } finally {
        setIsLoadingTasks(false);
      }
    };

    loadFilteredTasks();
  }, [filters.selectedUserId, loadingFilters, loadTasksByUser, reloadTasks]);

  const map = React.useMemo(() => byId(tasks), [tasks]);
  const topTasks = React.useMemo(() => {
    let filtered = tasks.filter((t) => !t.parentId);

    // Note: Server-side filtering is now applied via loadTasksByUser.
    // Client-side filtering below is kept as a fallback for edge cases
    // and for filtering UNASSIGNED tasks (which need special handling)
    if (filters.selectedUserId) {
      if (filters.selectedUserId === 'UNASSIGNED') {
        // UNASSIGNED needs client-side filter since server returns tasks with no userId
        filtered = filtered.filter(t => !t.userId || t.userId === 'unassigned');
      }
      // For specific userId, server already filtered - no client filter needed
    }

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

  // Force re-render when timer updates
  // Note: tasksChanged is already handled by useTasks() hook — no duplicate listener needed
  const [, setForceRender] = React.useState({});
  React.useEffect(() => {
    const onTimerToggled = () => {
      setForceRender({});
    };

    eventBus.subscribe("timerToggled", onTimerToggled);
    return () => {
      eventBus.unsubscribe("timerToggled", onTimerToggled);
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
      Archived: [],
    };

    for (const parent of topTasks) {
      const status = (parent.triageStatus || 'Backlog') as TriageStatus;
      if (acc[status]) {
        acc[status].push({ kind: "parent", task: parent });
      } else {
        // Fallback for completely unknown status, though 'Backlog' should cover it
        acc['Backlog'].push({ kind: "parent", task: parent });
      }
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
        const childStatus = (child.triageStatus || 'Backlog') as TriageStatus;
        if (acc[childStatus]) {
          acc[childStatus].push({ kind: "child", task: child, parent });
        } else {
          acc['Backlog'].push({ kind: "child", task: child, parent });
        }
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
  }, [topTasks, map]); // Removed tasks as dependency as topTasks and map are derived from it

  // Quick add handler (used by extracted QuickAddInput component)
  const handleQuickAdd = React.useCallback((title: string, userId?: string) => {
    createTask(title, null, userId);
  }, [createTask]);

  // Archive handlers
  const handleArchiveClick = (columnTitle: TriageStatus) => {
    setArchiveColumnTitle(columnTitle);
    setArchiveOnlyOldCards(false);
    setArchiveDialogOpen(true);
  };

  const handleConfirmArchive = () => {
    if (!archiveColumnTitle) return;

    const weeksComputation = settings.weeksComputation || 4;
    const cutoffDate = Date.now() - (weeksComputation * 7 * 24 * 60 * 60 * 1000);

    // Get all cards in the column
    const cardsToArchive = grouped[archiveColumnTitle];
    let archivedCount = 0;

    cardsToArchive.forEach((card) => {
      const task = card.task;
      const taskDate = task.terminationDate || task.createdAt;

      // If archiveOnlyOldCards is checked, only archive tasks older than weeksComputation
      if (!archiveOnlyOldCards || taskDate < cutoffDate) {
        updateStatus(task.id, "Archived");
        archivedCount++;
      }
    });

    setArchiveDialogOpen(false);
    setArchiveColumnTitle(null);

    // Show success message
    if (archivedCount > 0) {
      console.log(`Archived ${archivedCount} tasks from ${archiveColumnTitle}`);
    }
  };

  const handleCancelArchive = () => {
    setArchiveDialogOpen(false);
    setArchiveColumnTitle(null);
  };

  return (
    <div className="w-full overflow-x-auto">
      <QuickAddInput onAdd={handleQuickAdd} selectedUserId={filters.selectedUserId} />

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
        )}
      </div>

      {isLoadingTasks && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
          Loading tasks...
        </div>
      )}

      <div className="flex gap-4 pb-4">
        {STATUSES.map((s) => (
          <Column
            key={s}
            title={s}
            cards={grouped[s]}
            tasks={tasks}
            onDropTask={handleDropTask}
            onChangeStatus={handleChangeStatus}
            onUpdateCategory={handleUpdateCategory}
            onUpdateUser={handleUpdateUser}
            onToggleUrgent={toggleUrgent}
            onToggleImpact={toggleImpact}
            onToggleMajorIncident={toggleMajorIncident}
            onToggleDone={handleToggleDone}
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
            highlightedTaskId={localHighlightedTaskId}
            highlightedCardRef={highlightedCardRef}
            onArchive={handleArchiveClick}
          />
        ))}
      </div>

      {/* Archive Confirmation Dialog */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Tasks</DialogTitle>
            <DialogDescription>
              Archive all tasks from the {archiveColumnTitle} column.
              {grouped[archiveColumnTitle || "Done"]?.length > 0 && (
                <span className="block mt-2">
                  This will archive {grouped[archiveColumnTitle || "Done"].length} tasks.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="archive-old-only"
                checked={archiveOnlyOldCards}
                onCheckedChange={(checked) => setArchiveOnlyOldCards(!!checked)}
              />
              <Label htmlFor="archive-old-only">
                Only archive cards older than {settings.weeksComputation || 4} weeks
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelArchive}>
              Cancel
            </Button>
            <Button onClick={handleConfirmArchive} variant="default">
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KanbanBoard;
