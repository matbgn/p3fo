import type { CSSProperties } from 'react';
import { TASK_COLORS, type FreeTaskColor, type PresetTaskColor, type TaskColor } from './types.js';

export { TASK_COLORS };
export type { FreeTaskColor, PresetTaskColor, TaskColor } from './types.js';

type ColorStyle = {
  label: string;
  swatch: string;
  /** CSS colour for vertical accent bars; null when the task has no colour. */
  bar: string | null;
};

/** Styles for the built-in colors only; free colors are resolved at runtime. */
export const TASK_COLOR_STYLES: Record<PresetTaskColor, ColorStyle> = {
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

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;

/**
 * Normalizes a user-picked color to `#rrggbb` (lowercase), expanding the
 * shorthand `#rgb` form. Returns null for anything that is not a color.
 */
export function normalizeFreeColor(value: unknown): FreeTaskColor | null {
  if (typeof value !== 'string') return null;

  const raw = value.trim().toLowerCase();

  if (HEX6.test(raw)) return raw as FreeTaskColor;

  if (HEX3.test(raw)) {
    const [red, green, blue] = raw.slice(1).split('');
    return `#${red}${red}${green}${green}${blue}${blue}` as FreeTaskColor;
  }

  return null;
}

export function isPresetTaskColor(value: unknown): value is PresetTaskColor {
  return typeof value === 'string' && (TASK_COLORS as readonly string[]).includes(value);
}

export function isFreeTaskColor(value: unknown): value is FreeTaskColor {
  return normalizeFreeColor(value) !== null;
}

export function isTaskColor(value: unknown): value is TaskColor {
  return isPresetTaskColor(value) || isFreeTaskColor(value);
}

/** The stable settings key of a color: the preset id or the normalized hex. */
export function taskColorKey(color: TaskColor): string {
  if (isPresetTaskColor(color)) return color;

  return normalizeFreeColor(color) ?? color;
}

/**
 * The color to store for an incoming value, or null when it is not a color.
 * Free colors are normalized so the same color always has the same key.
 */
export function normalizeTaskColor(value: unknown): TaskColor | null {
  if (isPresetTaskColor(value)) return value;

  return normalizeFreeColor(value);
}

export type ResolvedTaskColorStyle = {
  /** Default display name (preset label, or the hex itself for a free color). */
  label: string;
  /** Tailwind classes for a swatch; free colors use `swatchStyle` instead. */
  swatchClass: string;
  /** Inline background for a free color. */
  swatchStyle?: CSSProperties;
  /** CSS color for a vertical accent bar; null for `none`. */
  bar: string | null;
};

/** Resolves the presentation of any task color, preset or free. */
export function resolveTaskColorStyle(
  color: TaskColor | null | undefined,
): ResolvedTaskColorStyle {
  const value = color ?? 'none';

  if (isPresetTaskColor(value)) {
    const style = TASK_COLOR_STYLES[value];

    return {
      label: style.label,
      swatchClass: style.swatch,
      bar: style.bar,
    };
  }

  const hex = normalizeFreeColor(value) ?? '#000000';

  return {
    label: hex,
    swatchClass: 'border border-border',
    swatchStyle: { backgroundColor: hex },
    bar: hex,
  };
}

export function taskColorBar(color: TaskColor | undefined): string | undefined {
  if (!color || color === 'none') return undefined;

  return resolveTaskColorStyle(color).bar ?? undefined;
}
