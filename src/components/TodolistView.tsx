import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Task, TriageStatus, Category } from "@/hooks/useTasks";
import { Filters } from "./FilterControls";
import { aStarTextSearch } from "@/lib/a-star-search";
import { sortTasks } from "@/utils/taskSorting";
import { TodolistRow, TodolistRowData } from "./TodolistRow";
import { LazyRow } from "./LazyRow";
import { QuickAddTask } from "./QuickAddTask";

interface TodolistViewProps {
  tasks: Task[];
  displayFilters: Filters;
  storedFilters: Filters;
  loadingFilters: boolean;
  updateStatus: (id: string, status: TriageStatus) => void;
  updateDifficulty: (id: string, difficulty: 0.5 | 1 | 2 | 3 | 5 | 8) => void;
  updateCategory: (id: string, category: Category) => void;
  updateTitle: (id: string, title: string) => void;
  updateComment: (id: string, comment: string) => void;
  updateTerminationDate: (id: string, terminationDate: number | undefined) => void;
  updateDurationInMinutes: (id: string, durationInMinutes: number | undefined) => void;
  updateUser: (id: string, userId: string | undefined) => void;
  deleteTask: (id: string) => void;
  duplicateTaskStructure: (id: string) => void;
  toggleUrgent: (id: string) => void;
  toggleImpact: (id: string) => void;
  toggleMajorIncident: (id: string) => void;
  toggleSprintTarget: (id: string) => void;
  toggleDone: (task: Task) => void;
  toggleTimer: (id: string, currentUserId?: string) => void;
  createTask: (title: string, parentId?: string | null, userId?: string) => Promise<string>;
  onFocusOnTask?: (taskId: string) => void;
  highlightedTaskId: string | null;
  scrollTodolistRowRef: React.MutableRefObject<Map<string, HTMLElement>>;
  expandedParents: Set<string>;
  onToggleExpand: (taskId: string) => void;
}

const TodolistView: React.FC<TodolistViewProps> = ({
  tasks,
  displayFilters,
  storedFilters,
  loadingFilters,
  updateStatus,
  updateDifficulty,
  updateCategory,
  updateTitle,
  updateComment,
  updateTerminationDate,
  updateDurationInMinutes,
  updateUser,
  deleteTask,
  duplicateTaskStructure,
  toggleUrgent,
  toggleImpact,
  toggleMajorIncident,
  toggleSprintTarget,
  toggleDone,
  toggleTimer,
  createTask,
  onFocusOnTask,
  highlightedTaskId,
  scrollTodolistRowRef,
  expandedParents,
  onToggleExpand,
}) => {
  const { t } = useTranslation();
  const map = useMemo(() => {
    const m = new Map<string, Task>();
    tasks.forEach(t => m.set(t.id, t));
    return m;
  }, [tasks]);

  const filteredTopTasks = useMemo(() => {
    let topTasks = tasks.filter(t => !t.parentId).sort(sortTasks.taskboard);

    if (displayFilters.searchText?.trim()) {
      const searchResults = aStarTextSearch(
        displayFilters.searchText,
        topTasks.map(t => ({ id: t.id, title: t.title }))
      );
      const matchingIds = new Set(
        searchResults.filter(r => r.score >= 0.001).map(r => r.taskId)
      );
      topTasks = topTasks.filter(t => matchingIds.has(t.id));
    }

    if (displayFilters.showUrgent) topTasks = topTasks.filter(t => t.urgent);
    if (displayFilters.showImpact) topTasks = topTasks.filter(t => t.impact);
    if (displayFilters.showMajorIncident) topTasks = topTasks.filter(t => t.majorIncident);
    if (displayFilters.showSprintTarget) topTasks = topTasks.filter(t => t.sprintTarget);

    if (displayFilters.difficulty?.length > 0) {
      topTasks = topTasks.filter(t => !t.difficulty || displayFilters.difficulty.includes(t.difficulty));
    }
    if (displayFilters.category?.length > 0) {
      topTasks = topTasks.filter(t => !t.category || displayFilters.category.includes(t.category));
    }
    if (displayFilters.status?.length > 0) {
      topTasks = topTasks.filter(t => displayFilters.status.includes(t.triageStatus));
    }
    if (storedFilters.selectedUserId) {
      if (storedFilters.selectedUserId === 'UNASSIGNED') {
        topTasks = topTasks.filter(t => !t.userId || t.userId === 'unassigned');
      } else {
        topTasks = topTasks.filter(t => t.userId === storedFilters.selectedUserId);
      }
    }

    return topTasks;
  }, [tasks, displayFilters, storedFilters.selectedUserId]);

  const flattenedRows = useMemo(() => {
    const rows: TodolistRowData[] = [];

    const addTaskRecursive = (task: Task, depth: number) => {
      const hasChildren = !!(task.children && task.children.length > 0);
      const isExpanded = expandedParents.has(task.id);

      rows.push({
        task,
        depth,
        hasChildren,
        isExpanded,
      });

      if (hasChildren && isExpanded) {
        const children = (task.children || [])
          .map(id => map.get(id))
          .filter((c): c is Task => !!c)
          .sort(sortTasks.taskboard);

        const filteredChildren = children.filter(child => {
          if (displayFilters.status?.length > 0 && !displayFilters.status.includes(child.triageStatus)) {
            return false;
          }
          return true;
        });

        for (const child of filteredChildren) {
          addTaskRecursive(child, depth + 1);
        }
      }
    };

    for (const task of filteredTopTasks) {
      addTaskRecursive(task, 0);
    }

    return rows;
  }, [filteredTopTasks, expandedParents, map, displayFilters.status]);

  if (loadingFilters) {
    return <div className="text-xs text-muted-foreground px-4 py-8">{t('todolist.loadingFilters')}</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Quick add row at top */}
      <div className="px-3 py-1.5 border-b border-border bg-accent/5 shrink-0 min-w-[1000px]">
        <QuickAddTask
          placeholder={t('todolist.topTaskPlaceholder')}
          showPlusIcon
          userId={storedFilters.selectedUserId && storedFilters.selectedUserId !== 'UNASSIGNED' ? storedFilters.selectedUserId : undefined}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
        <div className="min-w-[1000px]">
          {flattenedRows.length === 0 ? (
            <div className="text-xs text-muted-foreground px-4 py-8">{t('todolist.noTasksMatch')}</div>
          ) : (
            flattenedRows.map(row => (
              <LazyRow key={row.task.id}>
                <TodolistRow
                  row={row}
                  tasks={tasks}
                  onToggleExpand={onToggleExpand}
                  updateStatus={updateStatus}
                  updateDifficulty={updateDifficulty}
                  updateCategory={updateCategory}
                  updateTitle={updateTitle}
                  updateComment={updateComment}
                  updateTerminationDate={updateTerminationDate}
                  updateDurationInMinutes={updateDurationInMinutes}
                  updateUser={updateUser}
                  deleteTask={deleteTask}
                  duplicateTaskStructure={duplicateTaskStructure}
                  toggleUrgent={toggleUrgent}
                  toggleImpact={toggleImpact}
                  toggleMajorIncident={toggleMajorIncident}
                  toggleSprintTarget={toggleSprintTarget}
                  toggleDone={toggleDone}
                  toggleTimer={toggleTimer}
                  createTask={createTask}
                  onFocusOnTask={onFocusOnTask}
                  isHighlighted={row.task.id === highlightedTaskId}
                  scrollTodolistRowRef={scrollTodolistRowRef}
                />
              </LazyRow>
            ))
          )}
          <div className="h-[50px] shrink-0" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
};

export { TodolistView };
