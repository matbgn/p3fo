import {
  TASK_COLORS,
  normalizeTaskColor,
  resolveTaskColorStyle,
  taskColorKey,
  type TaskColor,
} from './planner/colors.js';

/**
 * Workspace taxonomy: the editable list of task categories and the optional
 * color associated with each one. Both live in `AppSettingsEntity` so every
 * collaborator sees the same meaning, and so the categories are no longer
 * hardcoded in the application.
 *
 * A "label" is a category: it is the base name, and it may or may not be
 * associated with a color (preset or free). Colors without a category keep
 * their default name.
 */

export const GENERAL_CATEGORY = 'General';

/** The categories new workspaces start with; workspaces may edit them. */
export const DEFAULT_CATEGORIES = [
  'Marketing',
  'Documentation',
  'Consulting',
  'Testing',
  'Funerals',
  'Negotiated overtime',
  'Sickness',
  'Finances',
  'HR',
  'Training',
  'Support',
  'UX/UI',
  'Admin',
  'Development',
  'System Operations',
  'Private',
] as const;

export const MAX_CATEGORY_NAME_LENGTH = 40;
export const MAX_CATEGORIES = 100;

/**
 * The most color associations a workspace can hold: one per category, plus
 * the presets so a preset never loses its name when categories are rewritten.
 * The mapping is otherwise effectively unbounded (any `#rrggbb` key), so it
 * must be capped wherever it is stored.
 */
export const MAX_COLOR_LABELS = MAX_CATEGORIES + TASK_COLORS.length;

/**
 * Names the application reserves for its own "no category" semantics. A real
 * category with one of these names would collide with the sentinel used by
 * the timesheet and filters. `none` is the sentinel of every category picker
 * (TaskCard, TodolistRow, TaskEditModal, CategorySelect); a category with that
 * name could never be selected or displayed.
 */
const RESERVED_CATEGORY_KEYS = new Set(['Uncategorized', 'none'].map(labelKey));

/** `color key` (preset id or `#rrggbb`) → category name. */
export type ColorLabels = Record<string, string>;

/** Trims a name and collapses inner whitespace to single spaces. */
export function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Case, spaces and hyphens are ignored when matching names and `#tags`. */
export function labelKey(value: string): string {
  return value.toLowerCase().replace(/[\s-]+/g, '');
}

/** The `#tag` typed for a category name: lowercase, spaces as `-`. */
export function categoryTag(name: string): string {
  return normalizeCategoryName(name).toLowerCase().replace(/ /g, '-');
}

/** True for a name reserved by the application ("Uncategorized"). */
export function isReservedCategoryName(name: string): boolean {
  return RESERVED_CATEGORY_KEYS.has(labelKey(name));
}

/**
 * Whether a name is storable as a category: it must keep a non-empty label
 * key (so `#tag` matching still works), fit the length limit, and not be a
 * reserved name.
 */
export function isValidCategoryName(name: string): boolean {
  const normalized = normalizeCategoryName(name);

  return (
    normalized.length > 0 &&
    normalized.length <= MAX_CATEGORY_NAME_LENGTH &&
    labelKey(normalized) !== '' &&
    !isReservedCategoryName(normalized)
  );
}

/** Cleans a stored category list: unique names, trimmed, bounded. */
export function sanitizeCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const categories: string[] = [];

  for (const entry of value) {
    if (typeof entry !== 'string') continue;

    const name = normalizeCategoryName(entry);
    const key = labelKey(name);

    if (!isValidCategoryName(name) || seen.has(key)) continue;

    seen.add(key);
    categories.push(name);

    if (categories.length >= MAX_CATEGORIES) break;
  }

  return categories;
}

/** Cleans stored color→category associations. Unknown colors are dropped. */
export function sanitizeColorLabels(value: unknown): ColorLabels {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};

  const labels: ColorLabels = {};

  for (const [rawColor, rawName] of Object.entries(value)) {
    if (typeof rawName !== 'string') continue;

    const color = normalizeTaskColor(rawColor);
    const name = normalizeCategoryName(rawName);

    if (!color || color === 'none' || !name || name.length > MAX_CATEGORY_NAME_LENGTH) continue;

    labels[taskColorKey(color)] = name;

    if (Object.keys(labels).length >= MAX_COLOR_LABELS) break;
  }

  return labels;
}

/**
 * Sanitizes the taxonomy keys of an app-settings patch. A key is present only
 * when the caller means to replace it, so this must run wherever settings are
 * persisted; keeping the rule here prevents the storage adapters from drifting.
 */
export function sanitizeAppSettingsTaxonomy<T extends { categories?: unknown; colorLabels?: unknown }>(
  patch: T,
): T {
  const safe: T = { ...patch };

  if ('categories' in patch) safe.categories = sanitizeCategories(patch.categories);
  if ('colorLabels' in patch) safe.colorLabels = sanitizeColorLabels(patch.colorLabels);

  return safe;
}

/** Every category a picker should offer: the workspace list plus General. */
export function categoryOptions(categories: readonly string[] | undefined): string[] {
  const names = sanitizeCategories(categories);

  if (!names.some((name) => labelKey(name) === labelKey(GENERAL_CATEGORY))) {
    names.push(GENERAL_CATEGORY);
  }

  return names;
}

/** The category associated with a color, if any. */
export function labelForColor(
  color: TaskColor | null | undefined,
  labels: ColorLabels | undefined,
): string | null {
  if (!color || color === 'none' || !labels) return null;

  return labels[taskColorKey(color)] ?? null;
}

/**
 * The name shown for a color: its workspace category, else its translated
 * default (the hex itself for free colors). Shared by the color picker and
 * the palette so the selected name and the swatches cannot diverge.
 */
export function taskColorDisplayLabel(
  color: TaskColor,
  labels: ColorLabels | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const workspaceLabel = labelForColor(color, labels);
  if (workspaceLabel) return workspaceLabel;

  const fallback = resolveTaskColorStyle(color).label;

  return t(`planner.color.${color}`, { defaultValue: fallback });
}

/** The color associated with a category, if any. */
export function colorForCategory(
  category: string | null | undefined,
  labels: ColorLabels | undefined,
): TaskColor | null {
  if (!category || !labels) return null;

  const key = labelKey(category);

  for (const [color, name] of Object.entries(labels)) {
    if (labelKey(name) === key) return normalizeTaskColor(color);
  }

  return null;
}

/**
 * Associates a category with a color (or removes its association with null).
 * A category has at most one color and a color belongs to at most one
 * category, so conflicting associations are dropped.
 */
export function withCategoryColor(
  labels: ColorLabels | undefined,
  category: string,
  color: TaskColor | null,
): ColorLabels {
  const name = normalizeCategoryName(category);
  const nameKey = labelKey(name);
  const next: ColorLabels = {};

  for (const [rawColor, rawName] of Object.entries(sanitizeColorLabels(labels))) {
    if (nameKey && labelKey(rawName) === nameKey) continue;
    if (color && rawColor === taskColorKey(color)) continue;

    next[rawColor] = rawName;
  }

  if (name && color && color !== 'none') {
    next[taskColorKey(color)] = name;
  }

  return next;
}

/** Drops every association pointing to `category`. */
export function withoutCategory(labels: ColorLabels | undefined, category: string): ColorLabels {
  const key = labelKey(category);
  const next: ColorLabels = {};

  for (const [color, name] of Object.entries(sanitizeColorLabels(labels))) {
    if (labelKey(name) !== key) next[color] = name;
  }

  return next;
}

/** Follows a category rename in its color association. */
export function withRenamedCategory(
  labels: ColorLabels | undefined,
  previousName: string,
  nextName: string,
): ColorLabels {
  const key = labelKey(previousName);
  const name = normalizeCategoryName(nextName);
  const next: ColorLabels = {};

  for (const [color, label] of Object.entries(sanitizeColorLabels(labels))) {
    next[color] = labelKey(label) === key ? name : label;
  }

  return next;
}
