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

/** One of the built-in colors offered by the palette. */
export type PresetTaskColor = (typeof TASK_COLORS)[number];

/** A free color typed or picked by the user, stored as `#rrggbb`. */
export type FreeTaskColor = `#${string}`;

/**
 * A task color: a preset id or a free hex color. `none` means "no color".
 * The palette always offers the presets; the last choice opens a free picker.
 */
export type TaskColor = PresetTaskColor | FreeTaskColor;

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
