import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Task, TriageStatus, Category } from '@/hooks/useTasks';
import { StoryboardCard } from './StoryboardCard';
import { QuickAddTask } from './QuickAddTask';
import { sortTasks } from '@/utils/taskSorting';
import { hasActivableContent } from '@/utils/taskActivable';
import { renumberSiblings } from '@/utils/priorityEncoding';
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
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [reorderingTaskId, setReorderingTaskId] = useState<string | null>(null);
  const [openParents, setOpenParents] = useState<Record<string, boolean>>({});

  const containerRef = React.useRef<HTMLDivElement>(null);
  const autoScrollRafRef = React.useRef<number | null>(null);
  const autoScrollDirectionRef = React.useRef<number>(0);

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

  const stopAutoScroll = useCallback(() => {
    autoScrollDirectionRef.current = 0;
    if (autoScrollRafRef.current !== null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }, []);

  const tickAutoScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || autoScrollDirectionRef.current === 0) {
      autoScrollRafRef.current = null;
      return;
    }
    const speed = 12;
    container.scrollLeft += autoScrollDirectionRef.current * speed;
    autoScrollRafRef.current = requestAnimationFrame(tickAutoScroll);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const container = containerRef.current;
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
    },
    [tickAutoScroll],
  );

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>, targetTaskId: string) => {
      stopAutoScroll();
      e.preventDefault();
      e.stopPropagation();
      if (!draggedTaskId || draggedTaskId === targetTaskId) return;

      const draggedTask = directChildren.find(task => task.id === draggedTaskId);
      const targetTask = directChildren.find(task => task.id === targetTaskId);

      if (!draggedTask) return;
      if (!targetTask && targetTaskId !== '') return;

      const currentDisplayOrder = directChildren;
      const draggedIndex = currentDisplayOrder.findIndex(task => task.id === draggedTaskId);
      const targetIndex = currentDisplayOrder.findIndex(task => task.id === targetTaskId);

      if (targetIndex === -1 && targetTaskId !== '') return;

      let newDisplayOrder: Task[];
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

      // Dot-notation renumbering: siblings at `depth`, parent priority from selectedParent.
      const parentPriority = selectedParent?.priority ?? 0;
      const updatedPriorities = renumberSiblings(newDisplayOrder, parentPriority, depth);

      setReorderingTaskId(draggedTaskId);
      setDraggedTaskId(null);

      try {
        await updatePrioritiesBulk(updatedPriorities);
      } finally {
        setReorderingTaskId(null);
      }
    },
    [directChildren, draggedTaskId, selectedParent, depth, stopAutoScroll, updatePrioritiesBulk],
  );

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
        className="flex flex-nowrap overflow-x-auto flex-1 min-h-0 p-2 gap-3"
        ref={containerRef}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, '')}
        onDragEndCapture={stopAutoScroll}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) stopAutoScroll();
        }}
      >
        {directChildren.length === 0 ? (
          <div className="text-muted-foreground p-4">
            {t('taskboard.subfocusEmptyNoChildren')}
          </div>
        ) : (
          directChildren.map(task => {
            const descendants = getAllDescendants(task);
            const isReordering = reorderingTaskId === task.id;
            return (
              <div key={task.id} className="flex flex-col gap-2 min-w-fit">
                <StoryboardCard
                  task={task}
                  tasks={tasks}
                  isHighlighted={task.id === focusedTaskId}
                  {...taskCardMutationProps}
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
    </div>
  );
};

export default SubfocusView;