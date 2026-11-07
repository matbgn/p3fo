import React from 'react';
import { useTasks, type Task } from '@/hooks/useTasks';
import { useAllTasks } from '@/hooks/useAllTasks';
import { useUserSettings } from '@/hooks/useUserSettings';
import { TaskEditModal } from '@/components/TaskEditModal';

type TaskEditorDialogProps = {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: 'card' | 'details';
  onDelete?: (task: Task) => void;
  onDuplicate?: (task: Task) => void;
};

type TaskEditorDialogInnerProps = Omit<TaskEditorDialogProps, 'task'> & { task: Task };

export const TaskEditorDialog: React.FC<TaskEditorDialogProps> = (props) => {
  // Keep the hook-bearing dialog unmounted until there is a task to edit: in
  // filtered mode useAllTasks refetches the full list on every task change.
  if (!props.task) return null;

  return <TaskEditorDialogInner {...props} task={props.task} />;
};

const TaskEditorDialogInner: React.FC<TaskEditorDialogInnerProps> = ({
  task,
  open,
  onOpenChange,
  defaultTab = 'card',
  onDelete,
  onDuplicate,
}) => {
  const { tasks } = useAllTasks({ includeRecurring: true });
  const { userId: currentUserId } = useUserSettings();
  const {
    updateTitle,
    updateComment,
    updateStatus,
    updateCategory,
    updateDifficulty,
    updateUser,
    updateTerminationDate,
    updateDurationInMinutes,
    toggleUrgent,
    toggleImpact,
    toggleMajorIncident,
    toggleSprintTarget,
    toggleTimer,
    updateLinkedVoteIds,
  } = useTasks();

  return (
    <TaskEditModal
      task={task}
      tasks={tasks}
      isOpen={open}
      onClose={() => onOpenChange(false)}
      updateTitle={updateTitle}
      updateComment={updateComment}
      updateStatus={updateStatus}
      updateCategory={updateCategory}
      updateDifficulty={updateDifficulty}
      updateUser={updateUser}
      updateTerminationDate={updateTerminationDate}
      updateDurationInMinutes={updateDurationInMinutes}
      toggleUrgent={toggleUrgent}
      toggleImpact={toggleImpact}
      toggleMajorIncident={toggleMajorIncident}
      toggleSprintTarget={toggleSprintTarget}
      currentUserId={currentUserId}
      onToggleTimer={toggleTimer}
      updateLinkedVoteIds={updateLinkedVoteIds}
      defaultTab={defaultTab}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
    />
  );
};
