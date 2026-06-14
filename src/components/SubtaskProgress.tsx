import React from "react";
import type { Task } from "@/hooks/useTasks";

interface SubtaskProgressProps {
  task: Task;
  tasks: Task[];
  className?: string;
}

export const getSubtaskProgress = (task: Task, tasks: Task[]): { completed: number; total: number; percent: number } => {
  if (!task.children || task.children.length === 0) {
    return { completed: 0, total: 0, percent: 0 };
  }
  const total = task.children.length;
  const completed = task.children.filter((childId) => {
    const child = tasks.find((t) => t.id === childId);
    return child && (child.triageStatus === "Done" || child.triageStatus === "Dropped");
  }).length;
  return { completed, total, percent: Math.round((completed / total) * 100) };
};

export const SubtaskProgress: React.FC<SubtaskProgressProps> = ({
  task,
  tasks,
  className,
}) => {
  const { completed, total, percent } = React.useMemo(
    () => getSubtaskProgress(task, tasks),
    [task, tasks]
  );

  if (total === 0) return null;

  const isComplete = completed === total;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md font-medium ${
        isComplete
          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          : "bg-muted text-muted-foreground"
      } ${className || ""}`}
    >
      {isComplete ? "✓" : null}
      {completed}/{total}
    </span>
  );
};