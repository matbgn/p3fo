import { TASK_COLORS, type TaskColor } from './types';

export { TASK_COLORS };
export type { TaskColor };

type ColorStyle = {
  label: string;
  swatch: string;
  /** CSS colour for vertical accent bars; null when the task has no colour. */
  bar: string | null;
};

export const TASK_COLOR_STYLES: Record<TaskColor, ColorStyle> = {
  none: {
    label: 'No colour',
    swatch: 'border border-border bg-background',
    bar: null,
  },
  pink: {
    label: 'Pink',
    swatch: 'bg-pink-300 dark:bg-pink-700',
    bar: 'var(--task-color-pink)',
  },
  yellow: {
    label: 'Yellow',
    swatch: 'bg-yellow-300 dark:bg-yellow-700',
    bar: 'var(--task-color-yellow)',
  },
  black: {
    label: 'Black',
    swatch: 'bg-foreground',
    bar: 'var(--task-color-black)',
  },
  grey: {
    label: 'Grey',
    swatch: 'bg-muted-foreground/50',
    bar: 'var(--task-color-grey)',
  },
  cornflower: {
    label: 'Cornflower',
    swatch: 'bg-blue-300 dark:bg-blue-700',
    bar: 'var(--task-color-cornflower)',
  },
  mango: {
    label: 'Mango',
    swatch: 'bg-orange-300 dark:bg-orange-700',
    bar: 'var(--task-color-mango)',
  },
  green: {
    label: 'Green',
    swatch: 'bg-green-300 dark:bg-green-700',
    bar: 'var(--task-color-green)',
  },
  lilac: {
    label: 'Lilac',
    swatch: 'bg-purple-300 dark:bg-purple-700',
    bar: 'var(--task-color-lilac)',
  },
};

export function isTaskColor(value: unknown): value is TaskColor {
  return typeof value === 'string' && (TASK_COLORS as readonly string[]).includes(value);
}

export function taskColorBar(color: TaskColor | undefined): string | undefined {
  if (!color || color === 'none') return undefined;
  return TASK_COLOR_STYLES[color].bar ?? undefined;
}
