import { isPresetTaskColor, taskColorKey, type TaskColor } from './colors';
import { parseSmartTime } from './smart-time';
import { categoryTag, colorForCategory, labelKey, type ColorLabels } from '../workspace-taxonomy';

/** A user a mention can resolve to (`@trigram` in a new task). */
export type MentionUser = {
  userId: string;
  trigram?: string | null;
  username?: string;
};

export type TaskInputTaxonomy = {
  /** The workspace categories (labels base). */
  categories: readonly string[];
  /** Optional color associated with a category. */
  colorLabels: ColorLabels;
  /** Users whose trigram can be typed after `@`. */
  users?: readonly MentionUser[];
};

export type SmartRange = { start: number; end: number };

export type ParsedTaskInput = {
  /** The title with the recognized parts removed. */
  text: string;
  /** A leading `HH:mm`. */
  time: string | null;
  /** The color of the first `#label` that names a color, or a color id. */
  color: TaskColor | null;
  /** The category of the first `#label` that names one. */
  category: string | null;
  /** The user of the first `@trigram` that names one. */
  assigneeId: string | null;
  /** The `#word` still being typed at the end of the input. */
  tag: (SmartRange & { query: string }) | null;
};

/** A `#` (label) or `@` (user) at the start of a word. */
const LABEL_TAG = /(?<=^|\s)#(\S*)/gu;
const MENTION_TAG = /(?<=^|\s)@(\S*)/gu;

/** Text with, for each character, its offset in the original input. */
type Tracked = { text: string; origin: number[] };

function track(text: string): Tracked {
  return {
    text,
    origin: Array.from({ length: text.length }, (_, index) => index),
  };
}

function cut(tracked: Tracked, start: number, end: number): Tracked {
  return {
    text: tracked.text.slice(0, start) + tracked.text.slice(end),
    origin: [...tracked.origin.slice(0, start), ...tracked.origin.slice(end)],
  };
}

function trimTracked(tracked: Tracked): Tracked {
  const start = tracked.text.length - tracked.text.trimStart().length;
  const end = tracked.text.trimEnd().length;

  if (end <= start) {
    return { text: '', origin: [] };
  }

  return {
    text: tracked.text.slice(start, end),
    origin: tracked.origin.slice(start, end),
  };
}

/** Removes a token and the spaces on one side, so words stay one space apart. */
function removeToken(tracked: Tracked, start: number, end: number): Tracked {
  const { text } = tracked;
  let after = end;

  while (after < text.length && /\s/u.test(text[after])) after++;

  if (after < text.length) {
    return cut(tracked, start, after);
  }

  let before = start;

  while (before > 0 && /\s/u.test(text[before - 1])) before--;

  return cut(tracked, before, end);
}

type Applied<T> = {
  tracked: Tracked;
  value: T;
  /** Where the token sat in the original input. */
  start: number;
};

/**
 * Applies the first token `resolve` accepts, if the title keeps some text
 * after it (a label or mention alone stays as text: a task needs a title).
 */
function applyToken<T>(
  tracked: Tracked,
  pattern: RegExp,
  resolve: (query: string) => T | null,
): Applied<T> | null {
  for (const match of tracked.text.matchAll(pattern)) {
    const start = match.index;
    const end = start + match[0].length;
    const value = resolve(match[1]);

    if (value === null) continue;

    const remaining = trimTracked(removeToken(tracked, start, end));

    if (remaining.text === '') continue;

    return { tracked: remaining, value, start: tracked.origin[start] };
  }

  return null;
}

/** The trailing `@word`/`#word` of the original input, for suggestions. */
function trailingTag(input: string, pattern: RegExp): (SmartRange & { query: string }) | null {
  let tag: (SmartRange & { query: string }) | null = null;

  for (const match of input.matchAll(pattern)) {
    const start = match.index;
    const end = start + match[0].length;

    if (end === input.length) {
      tag = { start, end, query: match[1] };
    }
  }

  return tag;
}

function findUser(
  query: string,
  users: readonly MentionUser[] | undefined,
): MentionUser | null {
  if (!users) return null;

  const key = query.trim().toUpperCase();

  if (!key) return null;

  return (
    users.find((user) => (user.trigram ?? '').trim().toUpperCase() === key) ??
    null
  );
}

function resolveLabel(
  query: string,
  taxonomy: TaskInputTaxonomy,
): { category: string | null; color: TaskColor } | null {
  const key = labelKey(query);

  if (!key) return null;

  const matchedCategory =
    taxonomy.categories.find((name) => labelKey(name) === key) ?? null;
  const lowered = query.toLowerCase();
  const presetColor = isPresetTaskColor(lowered) ? lowered : null;
  const associatedColor = matchedCategory
    ? colorForCategory(matchedCategory, taxonomy.colorLabels)
    : null;
  const matchedColor = presetColor ?? associatedColor;

  if (!matchedCategory && !matchedColor) return null;

  return { category: matchedCategory, color: matchedColor ?? 'none' };
}

/**
 * Reads a new task's title:
 *
 * - The first `@trigram` naming a user assigns the task and is taken out.
 * - The first `#word` naming a workspace category or a color sets the
 *   category and/or its associated color, and is taken out. `#pink` (a color
 *   id) always works even after a rename. Later tags, and tags naming nothing,
 *   stay as text. A tag alone stays too: a task needs a title.
 * - Then a leading time ("17:30 Gym") is read by `parseSmartTime`.
 */
export function parseTaskInput(
  input: string,
  taxonomy: TaskInputTaxonomy,
  options: { parseTime?: boolean } = {},
): ParsedTaskInput {
  // Suggestions only make sense for a tag that did not apply.
  let tag = trailingTag(input, LABEL_TAG);
  let tracked = track(input);
  let assigneeId: string | null = null;
  let color: TaskColor | null = null;
  let category: string | null = null;

  const mention = applyToken(tracked, MENTION_TAG, (query) =>
    findUser(query, taxonomy.users),
  );

  if (mention) {
    tracked = mention.tracked;
    assigneeId = mention.value.userId;
  }

  const label = applyToken(tracked, LABEL_TAG, (query) =>
    resolveLabel(query, taxonomy),
  );

  if (label) {
    tracked = label.tracked;
    category = label.value.category;
    color = label.value.color === 'none' ? null : label.value.color;

    if (tag !== null && tag.start === label.start) tag = null;
  }

  // Callers without a date context (the board quick add) keep a leading
  // time in the title rather than dropping it.
  const parsed =
    options.parseTime === false
      ? { text: tracked.text.trim(), time: null }
      : parseSmartTime(tracked.text);

  return {
    text: parsed.text,
    time: parsed.time,
    color,
    category,
    assigneeId,
    tag,
  };
}

export type LabelSuggestion = {
  name: string;
  color: TaskColor | null;
};

/**
 * The categories to suggest for an in-progress tag, by name prefix or by
 * their associated color id. An empty query lists them all.
 */
export function suggestLabels(
  query: string,
  taxonomy: TaskInputTaxonomy,
): LabelSuggestion[] {
  const key = labelKey(query);

  return taxonomy.categories
    .map((name) => ({
      name,
      color: colorForCategory(name, taxonomy.colorLabels),
    }))
    .filter((suggestion) => {
      if (!key) return true;

      return (
        labelKey(suggestion.name).startsWith(key) ||
        (suggestion.color !== null &&
          taskColorKey(suggestion.color).startsWith(key))
      );
    });
}

/** Replaces the in-progress tag with the label's `#tag ` and returns the caret. */
export function completeTag(
  input: string,
  tag: SmartRange,
  name: string,
): { value: string; caret: number } {
  const inserted = `#${categoryTag(name)} `;

  return {
    value: input.slice(0, tag.start) + inserted + input.slice(tag.end),
    caret: tag.start + inserted.length,
  };
}
