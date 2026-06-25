import type { Task } from "@/hooks/useTasks";

export const getSubtaskProgress = (
  task: Task,
  tasks: Task[],
): { completed: number; total: number; percent: number } => {
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