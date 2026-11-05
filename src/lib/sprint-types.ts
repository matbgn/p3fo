/**
 * Sprint domain types and pure helpers.
 *
 * This module must stay free of React and of any app-only import so it can be
 * reused by the HTTP server's auto-close scheduler.
 */

export type SprintStatus = 'draft' | 'active' | 'closed';
export type SprintOutcome = 'done' | 'carried' | 'backlog' | 'dropped';
export type SprintAutoClosePolicy = 'preselected' | 'storyboard' | 'carry-all' | 'backlog-all';

export const DEFAULT_THEORETICAL_THROUGHPUT = 70;
export const DEFAULT_PRACTICE_PCT = 60;
export const DEFAULT_GRACE_HOURS = 24;
export const DEFAULT_WORKING_DAYS = 20;

export interface SprintTaskSource {
  id: string;
  title: string;
  triageStatus: string;
  impact?: boolean;
  category?: string;
  difficulty?: number;
  sprintTarget?: boolean;
  terminationDate?: number | string | null;
  userId?: string | null;
  parentId?: string | null;
  priority?: number | null;
}

export interface SprintTaskLike {
  id: string;
  title: string;
  triageStatus: string;
  impact?: boolean;
  category?: string;
  difficulty?: number;
  sprintTarget?: boolean;
  terminationDate?: number | string | null;
  userId?: string | null;
  parentId?: string | null;
  children?: string[];
  priority?: number;
}

export interface SprintScopeItem {
  taskId: string;
  title: string;
  points: number;
  userId: string | null;
  statusAtCommit: string;
  outcome?: SprintOutcome;
  pointsAtClose?: number;
  carriedToSprintId?: string | null;
}

export interface SprintImpediment {
  id: string;
  label: string;
  days: number;
  userId?: string;
  source?: 'manual' | 'traveler' | 'holiday';
}

export interface SprintCapacity {
  theoreticalPoints: number;
  practicePct: number;
  eftCount: number;
  workingDays: number;
  impediments: SprintImpediment[];
  impedimentDays: number;
  costPerDayPct: number;
  correctedPct: number;
  targetPoints: number;
}

export interface SprintMetrics {
  committedPoints: number;
  scopeDonePoints: number;
  openPoints: number;
  carriedPoints: number;
  unplannedDonePoints: number;
  achievedPoints: number;
  lastTheoreticalPoints: number;
  errorPct: number;
  velocity: number;
  completionPct: number;
  remainingToTarget: number;
}

export interface SprintWellbeingAggregate {
  count: number;
  meanRaw: number;
  score: number;
  updatedAt: string;
}

export interface SprintRetro {
  /** Glad / Sad / Mad and interactions between people. */
  gladSadMad: string;
  /** Points that led to schedule or goal deviations, and solutions found. */
  deviations: string;
  /** Ways to improve comfort and efficiency, tools and processes. */
  improvements: string;
  /** Particularly appreciated situations. */
  appreciated: string;
  /** Follow-up actions. */
  todos: string;
  checklist: Record<string, boolean>;
  wellbeing?: SprintWellbeingAggregate;
}

export const WHO5_QUESTIONS = [
  'I have felt cheerful and in good spirits',
  'I have felt calm and relaxed',
  'I have felt active and vigorous',
  'I woke up feeling fresh and rested',
  'My daily life has been filled with things that interest me',
] as const;

export const WHO5_OPTIONS: { value: number; label: string }[] = [
  { value: 5, label: 'All of the time' },
  { value: 4, label: 'Most of the time' },
  { value: 3, label: 'More than half of the time' },
  { value: 2, label: 'Less than half of the time' },
  { value: 1, label: 'Some of the time' },
  { value: 0, label: 'At no time' },
];

export function who5RawScore(answers: number[]): number {
  return answers.reduce((acc, value) => acc + (Number(value) || 0), 0);
}

/**
 * Aggregate anonymous WHO-5 answers. The result is all the UI is allowed to
 * see; per-user answers never leave the server.
 */
export const MIN_WELLBEING_RESPONDENTS = 3;

/**
 * Shared small-sample suppression: the UI never sees an aggregate based on
 * fewer than three respondents, regardless of where it is rendered.
 */
export function buildWellbeingAggregate(
  answersByUser: number[][],
): SprintWellbeingAggregate | null {
  if (answersByUser.length < MIN_WELLBEING_RESPONDENTS) return null;
  return aggregateWellbeing(answersByUser);
}

export function aggregateWellbeing(
  answersByUser: number[][],
  updatedAt = new Date().toISOString(),
): SprintWellbeingAggregate {
  const valid = answersByUser.filter((answers) => answers.length === WHO5_QUESTIONS.length);
  if (valid.length === 0) {
    return { count: 0, meanRaw: 0, score: 0, updatedAt };
  }
  const meanRaw =
    valid.reduce((acc, answers) => acc + who5RawScore(answers), 0) / valid.length;
  return {
    count: valid.length,
    meanRaw: Math.round(meanRaw * 100) / 100,
    score: Math.round(meanRaw * 4 * 10) / 10,
    updatedAt,
  };
}

export interface SprintAutoClose {
  enabled: boolean;
  graceHours: number;
  dueAt: number;
  policy: SprintAutoClosePolicy;
  createNextDraft: boolean;
  notify: boolean;
  /** Capacity policy captured when the sprint was armed, used for the next draft. */
  nextDraftCapacity?: SprintCapacity;
  armedBy: string;
  armedAt: string;
  status: 'armed' | 'skipped' | 'applied';
  lastRunAt?: string;
  lastRunBy?: 'auto' | string;
}

export interface SprintEntity {
  id: string;
  name: string;
  goal: string;
  status: SprintStatus;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  closedBy?: 'manual' | 'auto';
  scope: SprintScopeItem[];
  capacity: SprintCapacity;
  metrics: SprintMetrics;
  retro?: SprintRetro;
  autoClose?: SprintAutoClose;
}

export interface SprintStateEntity {
  activeSprintId: string | null;
  draftSprintId: string | null;
  sprints: SprintEntity[];
  updatedAt?: string;
}

export interface BurndownPoint {
  date: string;
  remaining: number;
  ideal: number;
}

export interface ChecklistItem {
  id: string;
  group: 'curation' | 'goal' | 'tip';
  label: string;
}

export const SPRINT_CHECKLIST: ChecklistItem[] = [
  { id: 'curation.retro', group: 'curation', label: 'Introduce retro tasks in kanban' },
  { id: 'curation.archive', group: 'curation', label: 'Archive Done cards without orphan sub-tasks' },
  { id: 'curation.count', group: 'curation', label: 'Count tasks done in P3fo' },
  { id: 'curation.zammad', group: 'curation', label: 'Import Zammad issues via diff import' },
  { id: 'curation.prs', group: 'curation', label: 'Cure stuck pull requests' },
  { id: 'curation.stale', group: 'curation', label: 'Cure stoned, cobwebbed and stuck cards' },
  { id: 'curation.backlog', group: 'curation', label: 'Cure or postpone Backlog and Stuck' },
  { id: 'curation.celebration', group: 'curation', label: 'Add done sprint goals to Celebration' },
  { id: 'curation.oldGoals', group: 'curation', label: 'Cure old Sprint Goals' },
  { id: 'goal.connect', group: 'goal', label: 'Connect to Strategies and Priorities' },
  { id: 'goal.prioritization', group: 'goal', label: 'Update Storyboard prioritization' },
  { id: 'goal.points', group: 'goal', label: 'Update Storyboard points and labels' },
  { id: 'goal.eightMax', group: 'goal', label: 'Ensure every sub-task is 8 points max' },
  { id: 'goal.set', group: 'goal', label: 'Set Sprint Goals from Storyboard and company priorities' },
  { id: 'goal.kanban', group: 'goal', label: 'Cure Sprint Kanban of unrelated goal labels' },
  { id: 'goal.resources', group: 'goal', label: 'Check Resources until the next planning' },
  { id: 'goal.backlog', group: 'goal', label: 'Add cards from unassigned Backlog if needed' },
  { id: 'tip.trainee', group: 'tip', label: 'Publish trainee job offer' },
  { id: 'tip.comparative', group: 'tip', label: 'P3fo comparative tool improvements' },
  { id: 'tip.timapi', group: 'tip', label: 'Upgrade EFT TimAPI PR#258' },
];

export function sprintNameFor(startDate: string, endDate: string): string {
  return `Sprint ${startDate} → ${endDate}`;
}

export function createEmptySprintState(): SprintStateEntity {
  return { activeSprintId: null, draftSprintId: null, sprints: [] };
}

export function createEmptyMetrics(): SprintMetrics {
  return {
    committedPoints: 0,
    scopeDonePoints: 0,
    openPoints: 0,
    carriedPoints: 0,
    unplannedDonePoints: 0,
    achievedPoints: 0,
    lastTheoreticalPoints: 0,
    errorPct: 0,
    velocity: 0,
    completionPct: 0,
    remainingToTarget: 0,
  };
}

export function roundPoints(value: number): number {
  return Math.round(value * 100) / 100;
}

export function indexTasks(tasks: SprintTaskLike[]): Map<string, SprintTaskLike> {
  return new Map(tasks.map((task) => [task.id, task]));
}

/**
 * Build the pure sprint view of persistence entities. Shared by the server
 * scheduler and the browser adapter so both see the same task graph.
 */
export function buildSprintTasks(entities: SprintTaskSource[]): SprintTaskLike[] {
  const childrenByParent = new Map<string, string[]>();
  entities.forEach((entity) => {
    if (!entity.parentId) return;
    const list = childrenByParent.get(entity.parentId) ?? [];
    list.push(entity.id);
    childrenByParent.set(entity.parentId, list);
  });
  return entities.map((entity) => ({
    id: entity.id,
    title: entity.title,
    triageStatus: entity.triageStatus,
    impact: entity.impact,
    category: entity.category,
    difficulty: entity.difficulty,
    sprintTarget: entity.sprintTarget,
    terminationDate:
      typeof entity.terminationDate === 'string'
        ? Date.parse(entity.terminationDate)
        : entity.terminationDate ?? null,
    userId: entity.userId ?? null,
    parentId: entity.parentId ?? null,
    children: childrenByParent.get(entity.id) ?? [],
    // Unset priority is the app-wide default 0, so browser and server ordering
    // (sortByStoryboard) agree instead of treating null as +Infinity.
    priority: entity.priority ?? 0,
  }));
}

/** Recursive points for a task, counting its children's points instead of its own. */
export function totalPoints(taskId: string, byId: Map<string, SprintTaskLike>, seen = new Set<string>()): number {
  if (seen.has(taskId)) return 0;
  seen.add(taskId);
  const task = byId.get(taskId);
  if (!task) return 0;
  if (task.children && task.children.length > 0) {
    return task.children.reduce((acc, childId) => acc + totalPoints(childId, byId, seen), 0);
  }
  return task.difficulty ?? 0;
}

export function buildScopeSnapshot(
  taskIds: string[],
  tasks: SprintTaskLike[],
): SprintScopeItem[] {
  const byId = indexTasks(tasks);
  const selected = new Set(taskIds);
  return taskIds
    .map((id) => byId.get(id))
    .filter((task): task is SprintTaskLike => Boolean(task))
    .filter((task) => {
      if (!task.parentId) return true;
      return !selected.has(task.parentId);
    })
    .map((task) => ({
      taskId: task.id,
      title: task.title,
      points: roundPoints(totalPoints(task.id, byId)),
      userId: task.userId ?? null,
      statusAtCommit: task.triageStatus,
    }));
}

export function sumScopePoints(scope: SprintScopeItem[]): number {
  return roundPoints(scope.reduce((acc, item) => acc + (item.points || 0), 0));
}

export function computeImpedimentSummary(
  impediments: SprintImpediment[],
  practicePct: number,
  eftCount: number,
  workingDays: number,
): { impedimentDays: number; costPerDayPct: number; correctedPct: number } {
  const days = roundPoints(impediments.reduce((acc, item) => acc + (Number(item.days) || 0), 0));
  const safeEft = Math.max(eftCount, 0.01);
  const safeDays = Math.max(workingDays, 1);
  const costPerDayPct = practicePct / safeEft / safeDays;
  const correctedPct = Math.max(0, practicePct - days * costPerDayPct);
  return {
    impedimentDays: days,
    costPerDayPct,
    correctedPct,
  };
}

export function computeCapacity(input: {
  theoreticalPoints?: number;
  practicePct?: number;
  eftCount?: number;
  workingDays?: number;
  impediments?: SprintImpediment[];
}): SprintCapacity {
  const theoreticalPoints = input.theoreticalPoints ?? DEFAULT_THEORETICAL_THROUGHPUT;
  const rawPracticePct = input.practicePct ?? DEFAULT_PRACTICE_PCT;
  // Accept both 0.6 and 60 from older drafts; the UI always edits full points.
  const practicePct = rawPracticePct > 0 && rawPracticePct <= 1 ? rawPracticePct * 100 : rawPracticePct;
  // EFT is a count, not a percentage. Legacy percentage conversion belongs in
  // the import/migration path; guessing here corrupts teams with more than 5 EFT.
  const eftCount = Math.max(input.eftCount ?? 1, 0.01);
  const workingDays = Math.max(input.workingDays ?? DEFAULT_WORKING_DAYS, 1);
  const impediments = input.impediments ?? [];
  const summary = computeImpedimentSummary(impediments, practicePct, eftCount, workingDays);
  return {
    theoreticalPoints,
    practicePct,
    eftCount,
    workingDays,
    impediments,
    ...summary,
    targetPoints: roundPoints((theoreticalPoints * summary.correctedPct) / 100),
  };
}

/** Count weekdays in an inclusive YYYY-MM-DD range. Server-safe fallback. */
export function countWeekdays(startDate: string, endDate: string): number {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end || end < start) return 0;
  let count = 0;
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function toDateOnly(value: Date | number | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysToDateOnly(value: string, days: number): string {
  const date = parseDateOnly(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() + days);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function nextWorkingDay(value: string): string {
  let candidate = addDaysToDateOnly(value, 1);
  for (let i = 0; i < 14; i += 1) {
    const date = parseDateOnly(candidate);
    if (date && date.getUTCDay() !== 0 && date.getUTCDay() !== 6) return candidate;
    candidate = addDaysToDateOnly(candidate, 1);
  }
  return candidate;
}

export function daysBetweenInclusive(startDate: string, endDate: string): number {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function toMillis(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function isDoneInRange(
  task: SprintTaskLike,
  startMs: number,
  endMs: number,
): boolean {
  if (task.triageStatus !== 'Done') return false;
  const doneAt = toMillis(task.terminationDate);
  if (doneAt === null) return false;
  return doneAt >= startMs && doneAt <= endMs;
}

/** A terminal task cannot be carried into another sprint. */
export function isTerminalTask(task: SprintTaskLike | undefined): boolean {
  if (!task) return false;
  return (
    task.triageStatus === 'Done' ||
    task.triageStatus === 'Dropped' ||
    task.triageStatus === 'Archived'
  );
}

export function rangeBounds(
  startDate: string,
  endDate: string,
  timeZone = 'Europe/Zurich',
): { startMs: number; endMs: number } {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end) return { startMs: 0, endMs: 0 };
  const startMs = zonedTimeToUtc(
    start.getUTCFullYear(),
    start.getUTCMonth() + 1,
    start.getUTCDate(),
    0,
    0,
    0,
    timeZone,
  );
  const endMs =
    zonedTimeToUtc(
      end.getUTCFullYear(),
      end.getUTCMonth() + 1,
      end.getUTCDate(),
      23,
      59,
      59,
      timeZone,
    ) + 999;
  return { startMs, endMs };
}

export function computeSprintMetrics(
  sprint: SprintEntity,
  tasks: SprintTaskLike[],
  previousTargetPoints = 0,
  timeZone = 'Europe/Zurich',
): SprintMetrics {
  const byId = indexTasks(tasks);
  const { startMs, endMs } = rangeBounds(sprint.startDate, sprint.endDate, timeZone);
  const committedPoints = sumScopePoints(sprint.scope);

  let scopeDonePoints = 0;
  const scopeIds = new Set(sprint.scope.map((item) => item.taskId));
  sprint.scope.forEach((item) => {
    const task = byId.get(item.taskId);
    if (task && isDoneInRange(task, startMs, endMs)) {
      scopeDonePoints += item.points;
    }
  });

  const achievedPoints = roundPoints(
    tasks
      .filter((task) => !task.parentId)
      .filter((task) => task.impact === true)
      .filter((task) => (task.category ?? '') !== 'Admin')
      .filter((task) => isDoneInRange(task, startMs, endMs))
      .reduce((acc, task) => acc + totalPoints(task.id, byId), 0),
  );

  const unplannedDonePoints = roundPoints(
    tasks
      .filter((task) => !task.parentId)
      .filter((task) => !scopeIds.has(task.id))
      .filter((task) => isDoneInRange(task, startMs, endMs))
      .reduce((acc, task) => acc + totalPoints(task.id, byId), 0),
  );

  const carriedPoints = roundPoints(
    sprint.scope
      .filter((item) => item.outcome === 'carried')
      .reduce((acc, item) => acc + (item.pointsAtClose ?? item.points), 0),
  );

  const openPoints = roundPoints(Math.max(0, committedPoints - scopeDonePoints));
  const eftCount = Math.max(sprint.capacity.eftCount, 0.01);
  const lastTheoreticalPoints = previousTargetPoints;
  const errorPct = lastTheoreticalPoints > 0
    ? ((achievedPoints - lastTheoreticalPoints) / lastTheoreticalPoints) * 100
    : 0;

  return {
    committedPoints,
    scopeDonePoints: roundPoints(scopeDonePoints),
    openPoints,
    carriedPoints,
    unplannedDonePoints,
    achievedPoints,
    lastTheoreticalPoints,
    errorPct: Math.round(errorPct * 10) / 10,
    velocity: roundPoints(achievedPoints / eftCount),
    completionPct: committedPoints > 0 ? Math.round((scopeDonePoints / committedPoints) * 1000) / 10 : 0,
    remainingToTarget: roundPoints(Math.max(0, sprint.capacity.targetPoints - achievedPoints)),
  };
}

export function buildBurndown(
  sprint: SprintEntity,
  tasks: SprintTaskLike[],
  timeZone = 'Europe/Zurich',
): BurndownPoint[] {
  const byId = indexTasks(tasks);
  const start = parseDateOnly(sprint.startDate);
  const end = parseDateOnly(sprint.endDate);
  if (!start || !end || end < start) return [];
  const { startMs } = rangeBounds(sprint.startDate, sprint.endDate, timeZone);
  const total = Math.max(sprint.capacity.targetPoints, 1);
  const impactTasks = tasks
    .filter((task) => !task.parentId)
    .filter((task) => task.impact === true)
    .filter((task) => (task.category ?? '') !== 'Admin');
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));

  // Start at the target on the first sprint day. Work completed on a day is
  // subtracted from the next day, so the line never opens below the target.
  const points: BurndownPoint[] = [
    { date: sprint.startDate, remaining: total, ideal: total },
  ];
  for (let offset = 1; offset <= totalDays + 1; offset += 1) {
    const dateOnly = addDaysToDateOnly(sprint.startDate, offset);
    const cursor = parseDateOnly(dateOnly);
    if (!cursor) continue;
    const cutoff = zonedTimeToUtc(
      cursor.getUTCFullYear(),
      cursor.getUTCMonth() + 1,
      cursor.getUTCDate(),
      0,
      0,
      0,
      timeZone,
    );
    const done = impactTasks.reduce((acc, task) => {
      if (task.triageStatus !== 'Done') return acc;
      const doneAt = toMillis(task.terminationDate);
      if (doneAt === null || doneAt < startMs || doneAt >= cutoff) return acc;
      return acc + totalPoints(task.id, byId);
    }, 0);
    points.push({
      date: dateOnly,
      remaining: roundPoints(Math.max(0, total - done)),
      ideal: roundPoints(Math.max(0, total - (total / totalDays) * offset)),
    });
  }
  return points;
}

export function resolveAutoCloseDueAt(
  endDate: string,
  graceHours = DEFAULT_GRACE_HOURS,
  timezone = 'Europe/Zurich',
): number {
  const date = parseDateOnly(endDate);
  if (!date) return Date.now();
  const wholeDays = Math.floor(Math.max(0, graceHours) / 24);
  const extraHours = Math.max(0, graceHours) % 24;
  const base = addDaysToDateOnly(endDate, wholeDays);
  const baseDate = parseDateOnly(base) ?? date;
  const endOfBase = zonedTimeToUtc(
    baseDate.getUTCFullYear(),
    baseDate.getUTCMonth() + 1,
    baseDate.getUTCDate(),
    23,
    59,
    59,
    timezone,
  );
  return endOfBase + extraHours * 3_600_000;
}

/** Resolve a wall-clock time in an IANA zone to an epoch. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): number {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = formatter.formatToParts(new Date(utcGuess));
    const values: Record<string, number> = {};
    parts.forEach((part) => {
      if (part.type !== 'literal') values[part.type] = Number(part.value);
    });
    const asUtc = Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour === 24 ? 0 : values.hour,
      values.minute,
      values.second,
    );
    return utcGuess - (asUtc - utcGuess);
  } catch {
    return utcGuess;
  }
}

export function sortByStoryboard<T extends { taskId: string; points: number }>(
  items: T[],
  byId: Map<string, SprintTaskLike>,
): T[] {
  return [...items].sort((a, b) => {
    const taskA = byId.get(a.taskId);
    const taskB = byId.get(b.taskId);
    const priorityA = taskA?.priority ?? Number.POSITIVE_INFINITY;
    const priorityB = taskB?.priority ?? Number.POSITIVE_INFINITY;
    if (priorityA !== priorityB) return priorityA - priorityB;
    const titleA = taskA?.title ?? '';
    const titleB = taskB?.title ?? '';
    return titleA.localeCompare(titleB);
  });
}

export interface AutoClosePlan {
  outcomes: Record<string, SprintOutcome>;
  carriedTaskIds: string[];
  carriedPoints: number;
  backlogPoints: number;
}

export function planAutoClose(
  sprint: SprintEntity,
  tasks: SprintTaskLike[],
  options: { policy?: SprintAutoClosePolicy; timeZone?: string } = {},
): AutoClosePlan {
  const byId = indexTasks(tasks);
  const open = sprint.scope.filter((item) => {
    const task = byId.get(item.taskId);
    // Missing tasks stay open conservatively; terminal tasks never carry.
    return !(task && isTerminalTask(task));
  });
  const policy = options.policy ?? sprint.autoClose?.policy ?? 'preselected';
  const outcomes: Record<string, SprintOutcome> = {};
  const carriedTaskIds: string[] = [];
  let carriedPoints = 0;
  let backlogPoints = 0;

  const carry = (item: SprintScopeItem) => {
    outcomes[item.taskId] = 'carried';
    carriedTaskIds.push(item.taskId);
    carriedPoints += item.points;
  };
  const toBacklog = (item: SprintScopeItem) => {
    outcomes[item.taskId] = 'backlog';
    backlogPoints += item.points;
  };

  if (policy === 'carry-all') {
    open.forEach(carry);
  } else if (policy === 'backlog-all') {
    open.forEach(toBacklog);
  } else if (policy === 'storyboard') {
    sortByStoryboard(open, byId).forEach(carry);
  } else {
    open.forEach((item) => {
      const prepared = item.outcome;
      if (prepared === 'backlog' || prepared === 'dropped' || prepared === 'done') {
        outcomes[item.taskId] = prepared;
        if (prepared === 'backlog') backlogPoints += item.points;
      } else {
        carry(item);
      }
    });
  }

  return {
    outcomes,
    carriedTaskIds,
    carriedPoints: roundPoints(carriedPoints),
    backlogPoints: roundPoints(backlogPoints),
  };
}

export function applyClose(
  sprint: SprintEntity,
  tasks: SprintTaskLike[],
  outcomes: Record<string, SprintOutcome>,
  previousTargetPoints: number,
  closedBy: 'manual' | 'auto',
  now = new Date().toISOString(),
  timeZone = 'Europe/Zurich',
): SprintEntity {
  const byId = indexTasks(tasks);
  const { startMs, endMs } = rangeBounds(sprint.startDate, sprint.endDate, timeZone);
  const scope = sprint.scope.map((item) => {
    const task = byId.get(item.taskId);
    let outcome: SprintOutcome;
    if (task && isDoneInRange(task, startMs, endMs)) {
      outcome = 'done';
    } else if (task && isTerminalTask(task)) {
      // Done outside the window still counts as done; Dropped/Archived drop.
      outcome = task.triageStatus === 'Done' ? 'done' : 'dropped';
    } else {
      outcome = outcomes[item.taskId] ?? 'carried';
    }
    return {
      ...item,
      outcome,
      pointsAtClose: item.points,
    };
  });
  const closed: SprintEntity = {
    ...sprint,
    scope,
    status: 'closed',
    closedAt: now,
    closedBy,
    updatedAt: now,
    autoClose: sprint.autoClose
      ? {
          ...sprint.autoClose,
          status: closedBy === 'auto' ? 'applied' : 'skipped',
          lastRunAt: now,
          lastRunBy: closedBy,
        }
      : sprint.autoClose,
  };
  return {
    ...closed,
    metrics: computeSprintMetrics(closed, tasks, previousTargetPoints, timeZone),
  };
}

export function startSprint(
  sprint: SprintEntity,
  scope: SprintScopeItem[],
  tasks: SprintTaskLike[] = [],
  previousTargetPoints = 0,
  now = new Date().toISOString(),
  timeZone = 'Europe/Zurich',
): SprintEntity {
  const started: SprintEntity = {
    ...sprint,
    scope,
    status: 'active',
    updatedAt: now,
    // Keep an armed auto-close configuration: the ceremony flow arms it on the
    // draft, and starting the sprint must not silently disable the feature.
    autoClose: sprint.autoClose ? { ...sprint.autoClose } : undefined,
  };
  return {
    ...started,
    metrics: computeSprintMetrics(started, tasks, previousTargetPoints, timeZone),
  };
}

/**
 * Build the next sprint draft from a closed sprint. The capacity policy is
 * supplied by the caller so auto-close and the manual ceremony share one
 * construction path instead of drifting apart.
 */
export function buildNextDraft(
  closedSprint: SprintEntity,
  carriedTaskIds: string[],
  tasks: SprintTaskLike[],
  capacity: SprintCapacity,
  now = new Date().toISOString(),
  timeZone = 'Europe/Zurich',
): SprintEntity | null {
  if (carriedTaskIds.length === 0) return null;
  const byId = indexTasks(tasks);
  // Defensive: callers may hand over stale IDs for tasks that finished since
  // the close plan was computed, so never seed a draft with terminal tasks.
  const carryableTaskIds = carriedTaskIds.filter((id) => !isTerminalTask(byId.get(id)));
  if (carryableTaskIds.length === 0) return null;
  const startDate = nextWorkingDay(closedSprint.endDate);
  const duration = Math.max(1, daysBetweenInclusive(closedSprint.startDate, closedSprint.endDate));
  const endDate = addDaysToDateOnly(startDate, duration - 1);
  const scope = buildScopeSnapshot(carryableTaskIds, tasks);
  const base: SprintEntity = {
    id: `${closedSprint.id}-next-${Date.now()}`,
    name: sprintNameFor(startDate, endDate),
    goal: '',
    status: 'draft',
    startDate,
    endDate,
    createdAt: now,
    updatedAt: now,
    scope,
    capacity,
    metrics: createEmptyMetrics(),
  };
  return {
    ...base,
    metrics: computeSprintMetrics(base, tasks, closedSprint.capacity.targetPoints, timeZone),
  };
}

export function previousClosedTargetPoints(
  state: SprintStateEntity,
  sprint: SprintEntity,
): number {
  const closed = state.sprints
    .filter((candidate) => candidate.status === 'closed' && candidate.id !== sprint.id)
    .sort((a, b) => (a.endDate < b.endDate ? 1 : -1));
  return closed[0]?.capacity.targetPoints ?? 0;
}
