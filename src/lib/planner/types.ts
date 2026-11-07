export const TASK_COLORS = [
  'none',
  'pink',
  'yellow',
  'black',
  'grey',
  'cornflower',
  'mango',
  'green',
  'lilac',
] as const;

export type TaskColor = (typeof TASK_COLORS)[number];

export type PlannerTaskLike = {
  id: string;
  title: string;
  plannedDate?: string | null;
  plannedTime?: string | null;
  plannedPosition?: string | null;
  color?: TaskColor;
  triageStatus?: string;
  parentId?: string | null;
  terminationDate?: number;
  userId?: string;
  urgent?: boolean;
  impact?: boolean;
  recurrence?: unknown;
  seriesId?: string | null;
};
