import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Task, TriageStatus, Category } from '@/hooks/useTasks';
import { StoryboardCard } from './StoryboardCard';
import { QuickAddTask } from './QuickAddTask';
import { sortTasks } from '@/utils/taskSorting';
import { hasActivableContent } from '@/utils/taskActivable';
import { renumberSiblings } from '@/utils/priorityEncoding';
import { useStoryboardDragDrop } from '@/hooks/useStoryboardDragDrop';
import { StoryboardDropIndicator } from './StoryboardDropIndicator';
import type { Filters } from './FilterControls';

interface SubfocusViewProps {
  tasks: Task[];
  map: Record<string, Task>;
  selectedParentId: string | null;
  depth: number;
  focusedTaskId?: string | null;
  currentUserId?: string;
  displayFilters: Filters;
  storedFilters: Filters;
  updateStatus: (id: string, status: TriageStatus) => void;
  updateDifficulty: (id: string, difficulty: 0.5 | 1 | 2 | 3 | 5 | 8) => void;
  updateCategory: (id: string, category: Category) => void;
  updateTitle: (id: string, title: string) => void;
  updateUser: (id: string, userId: string | undefined) => void;
  deleteTask: (id: string) => void;
  duplicateTaskStructure: (id: string) => void;
  toggleUrgent: (id: string) => void;
  toggleImpact: (id: string) => void;
  toggleMajorIncident: (id: string) => void;
  toggleSprintTarget: (id: string) => void;
  toggleDone: (id: string) => void;
  toggleTimer: (id: string, currentUserId?: string) => void;
  reparent: (id: string, parentId: string | null) => void;
  updateTerminationDate: (id: string, terminationDate: number | undefined) => void;
  updateComment: (id: string, comment: string) => void;
  updateDurationInMinutes: (id: string, durationInMinutes: number | undefined) => void;
  updatePrioritiesBulk: (items: { id: string; priority: number | undefined }[]) => Promise<void>;
  onFocusOnTask?: (taskId: string) => void;
  onDrillIntoChild?: (taskId: string) => void;
}

export const SubfocusView: React.FC<SubfocusViewProps> = ({
  tasks,
  map,
  selectedParentId,
  depth,
  focusedTaskId,
  currentUserId,
  displayFilters,
  storedFilters,
  updateStatus,
  updateDifficulty,
  updateCategory,
  updateTitle,
  updateUser,
  deleteTask,
  duplicateTaskStructure,
  toggleUrgent,
  toggleImpact,
  toggleMajorIncident,
  toggleSprintTarget,
  toggleDone,
  toggleTimer,
  reparent,
  updateTerminationDate,
  updateComment,
  updateDurationInMinutes,
  updatePrioritiesBulk,
  onFocusOnTask,
  onDrillIntoChild,
}) => {
  const { t } = useTranslation();
  const [openParents, setOpenParents] = useState<Record<string, boolean>>({});

  const selectedParent = selectedParentId ? map[selectedParentId] : null;

  // Direct children of the selected parent, sorted by taskboard sort.
  // Parents whose entire subtree is Done/Dropped/Archived are hidden:
  // there is nothing left to activate, so a ghost card would be noise.
  const directChildren = useMemo(() => {
    if (!selectedParent) return [];
    const children = (selectedParent.children || [])
      .map(id => map[id])
      .filter(Boolean) as Task[];
    return children
      .filter(child => hasActivableContent(child, map))
      .sort(sortTasks.taskboard);
  }, [selectedParent, map]);

  const handleStoryboardReorder = useCallback(
    (ordered: Task[]) =>
      updatePrioritiesBulk(renumberSiblings(ordered, selectedParent?.priority ?? 0, depth)),
    [updatePrioritiesBulk, selectedParent, depth],
  );

  const {
    containerRef,
    draggedId,
    dropPreview,
    reorderingId,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
    handleDragLeave,
  } = useStoryboardDragDrop<Task>({
    items: directChildren,
    onReorder: handleStoryboardReorder,
  });

  // Recursively gather all descendants for the collapsible nested groups.
  const getAllDescendants = useCallback(
    (task: Task): Task[] => {
      let result: Task[] = [];
      if (task.children) {
        for (const childId of task.children) {
          const child = map[childId];
          if (child) {
            result.push(child);
            result = result.concat(getAllDescendants(child));
          }
        }
      }
      return result;
    },
    [map],
  );

  const toggleParent = useCallback((id: string) => {
    setOpenParents(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // Empty state: no parent selected.
  if (!selectedParentId || !selectedParent) {
    return (
      <div className="flex flex-col h-full p-4 gap-3">
        <div className="text-muted-foreground p-4">
          {t('taskboard.subfocusEmptyNoParent')}
        </div>
      </div>
    );
  }

  const taskCardMutationProps = {
    updateStatus,
    updateDifficulty,
    updateCategory,
    updateTitle,
    updateUser: (id: string, userId: string | undefined) =>
      updateUser(id, userId === 'current-user' ? currentUserId : userId),
    deleteTask,
    duplicateTaskStructure,
    toggleUrgent,
    toggleImpact,
    toggleMajorIncident,
    toggleSprintTarget,
    toggleDone,
    toggleTimer,
    reparent,
    onFocusOnTask,
    updateTerminationDate,
    updateComment,
    updateDurationInMinutes,
  };

  return (
    <div className="flex flex-col h-full p-2 gap-3">
      <div className="flex items-center gap-2 shrink-0">
        <QuickAddTask
          parentId={selectedParentId}
          userId={
            storedFilters.selectedUserId && storedFilters.selectedUserId !== 'UNASSIGNED'
              ? storedFilters.selectedUserId
              : undefined
          }
          onCreatedFromTemplate={(parentId) => onFocusOnTask?.(parentId)}
          className="max-w-md"
        />
        <span className="text-xs text-muted-foreground">
          {t('taskboard.subtasksOfParent', { title: selectedParent.title })}
        </span>
      </div>

      <div
        className="relative flex flex-nowrap overflow-x-auto flex-1 min-h-0 p-2 gap-3"
        ref={containerRef}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEndCapture={handleDragEnd}
        onDragLeave={handleDragLeave}
      >
        <StoryboardDropIndicator preview={dropPreview} />
        {directChildren.length === 0 ? (
          <div className="text-muted-foreground p-4">
            {t('taskboard.subfocusEmptyNoChildren')}
          </div>
        ) : (
          directChildren.map(task => {
            const descendants = getAllDescendants(task);
            const isReordering = reorderingId === task.id;
            return (
              <div
                key={task.id}
                className="flex flex-col gap-2 min-w-fit"
                data-storyboard-column
                data-task-id={task.id}
              >
                <StoryboardCard
                  task={task}
                  tasks={tasks}
                  isHighlighted={task.id === focusedTaskId}
                  {...taskCardMutationProps}
                  disableReparenting={true}
                  open={!!openParents[task.id]}
                  onToggleOpen={toggleParent}
                  isReordering={isReordering}
                  isDragged={draggedId === task.id}
                  draggable={!isReordering}
                  onDragStart={(e) => handleDragStart(e, task.id)}
                />

                {openParents[task.id] && descendants.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground px-1">
                      {t('taskboard.subtasksOfParent', { title: task.title })}
                    </div>
                    {descendants
                      .filter(child => hasActivableContent(child, map))
                      .map(child => (
                      <StoryboardCard
                        key={child.id}
                        task={child}
                        tasks={tasks}
                        isHighlighted={child.id === focusedTaskId}
                        {...taskCardMutationProps}
                        disableReparenting={true}
                        isDragged={draggedId === child.id}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default SubfocusView;