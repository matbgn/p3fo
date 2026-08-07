import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import {
  calculateTimeSpentOnNewCapabilities,
  calculateHighImpactTaskFrequencyPerEFT,
  calculateFailureRate,
  getCompletedHighImpactTasks,
  createTaskMap,
  createHighImpactMap,
  UserWorkload,
} from './metrics';
import type { Task } from '@/hooks/useTasks';

const HOUR = 3600000;
const DAY = 24 * HOUR;

function makeTask(overrides: Partial<Task> & { id: string; createdAt: number }): Task {
  return {
    title: 'Test Task',
    parentId: null,
    children: [],
    triageStatus: 'Done',
    urgent: false,
    impact: false,
    majorIncident: false,
    sprintTarget: false,
    difficulty: 1,
    timer: [],
    category: 'Support',
    priority: 50,
    userId: 'user-A',
    ...overrides,
  };
}

describe('calculateTimeSpentOnNewCapabilities', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-04-08T12:00:00Z'));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('returns the raw share of high-impact time across all users, unweighted', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;
    const periodStart = cutoffDate + DAY;

    const tasks: Task[] = [
      makeTask({
        id: 't1',
        createdAt: periodStart,
        impact: true,
        userId: 'user-A',
        timer: [{ startTime: periodStart, endTime: periodStart + 5 * HOUR }],
      }),
      makeTask({
        id: 't2',
        createdAt: periodStart,
        impact: false,
        userId: 'user-A',
        timer: [{ startTime: periodStart + 6 * HOUR, endTime: periodStart + 10 * HOUR }],
      }),
      makeTask({
        id: 't3',
        createdAt: periodStart,
        impact: false,
        userId: 'user-B',
        timer: [{ startTime: periodStart, endTime: periodStart + 10 * HOUR }],
      }),
    ];

    const taskMap = Object.fromEntries(tasks.map(t => [t.id, t]));
    const highImpactMap: Record<string, boolean> = { t1: true, t2: false, t3: false };

    const result = calculateTimeSpentOnNewCapabilities(tasks, 4, taskMap, highImpactMap);

    const expectedPct = (5 * HOUR) / (5 * HOUR + 4 * HOUR + 10 * HOUR) * 100;
    expect(result.percentage).toBeCloseTo(expectedPct, 1);
    expect(result.totalTime).toBe(5 * HOUR + 4 * HOUR + 10 * HOUR);
    expect(result.newCapabilitiesTime).toBe(5 * HOUR);
  });

  it('counts unassigned task time directly (no workload fudge factor)', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;
    const periodStart = cutoffDate + DAY;

    const tasks: Task[] = [
      makeTask({
        id: 't1',
        createdAt: periodStart,
        impact: true,
        userId: 'user-A',
        timer: [{ startTime: periodStart, endTime: periodStart + 5 * HOUR }],
      }),
      makeTask({
        id: 't2',
        createdAt: periodStart,
        impact: false,
        userId: '',
        timer: [{ startTime: periodStart, endTime: periodStart + 10 * HOUR }],
      }),
      makeTask({
        id: 't3',
        createdAt: periodStart,
        impact: false,
        userId: 'unknown-user',
        timer: [{ startTime: periodStart, endTime: periodStart + 10 * HOUR }],
      }),
    ];

    const taskMap = Object.fromEntries(tasks.map(t => [t.id, t]));
    const highImpactMap: Record<string, boolean> = { t1: true, t2: false, t3: false };

    const result = calculateTimeSpentOnNewCapabilities(tasks, 4, taskMap, highImpactMap);

    // 5h high-impact out of 25h total — unassigned time dilutes the share directly
    const expectedPct = (5 * HOUR) / (25 * HOUR) * 100;
    expect(result.percentage).toBeCloseTo(expectedPct, 1);
  });

  it('returns 100% when all tracked time is on high-impact tasks', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;
    const periodStart = cutoffDate + DAY;

    const tasks: Task[] = [
      makeTask({
        id: 't1',
        createdAt: periodStart,
        impact: true,
        userId: 'user-A',
        timer: [{ startTime: periodStart, endTime: periodStart + 10 * HOUR }],
      }),
    ];

    const taskMap = Object.fromEntries(tasks.map(t => [t.id, t]));
    const highImpactMap: Record<string, boolean> = { t1: true };

    const result = calculateTimeSpentOnNewCapabilities(tasks, 4, taskMap, highImpactMap);

    expect(result.percentage).toBeCloseTo(100, 1);
  });

  it('returns 0 when no tracked time exists', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;
    const periodStart = cutoffDate + DAY;

    const tasks: Task[] = [
      makeTask({
        id: 't1',
        createdAt: periodStart,
        impact: true,
        userId: 'user-A',
        timer: [],
      }),
    ];

    const taskMap = Object.fromEntries(tasks.map(t => [t.id, t]));
    const highImpactMap: Record<string, boolean> = { t1: true };

    const result = calculateTimeSpentOnNewCapabilities(tasks, 4, taskMap, highImpactMap);

    expect(result.percentage).toBe(0);
  });
});

describe('calculateHighImpactTaskFrequencyPerEFT', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-04-08T12:00:00Z'));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('divides high-impact root tasks achieved in the window by total EFT times weeks', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({
        id: 't1',
        createdAt: cutoffDate - 6 * DAY,
        terminationDate: cutoffDate + DAY,
        impact: true,
        userId: 'user-A',
        triageStatus: 'Done',
      }),
      makeTask({
        id: 't2',
        createdAt: cutoffDate - 6 * DAY,
        terminationDate: cutoffDate + DAY,
        impact: true,
        userId: 'user-A',
        triageStatus: 'Done',
      }),
      makeTask({
        id: 't3',
        createdAt: cutoffDate - 6 * DAY,
        terminationDate: cutoffDate + DAY,
        impact: true,
        userId: 'user-B',
        triageStatus: 'Done',
      }),
    ];

    const taskMap = Object.fromEntries(tasks.map(t => [t.id, t]));
    const highImpactMap: Record<string, boolean> = { t1: true, t2: true, t3: true };
    const userWorkloads: UserWorkload[] = [
      { userId: 'user-A', workload: 40 },
      { userId: 'user-B', workload: 50 },
    ];

    const result = calculateHighImpactTaskFrequencyPerEFT(
      tasks, 4, userWorkloads, taskMap, highImpactMap
    );

    const totalEFT = (40 + 50) / 100;
    const expected = 3 / totalEFT / 4;

    expect(result).toBeCloseTo(expected, 4);
  });

  it('uses achievement time, not creation time, for the window', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    // Created 6 weeks ago (outside window) but achieved 2 weeks ago (inside)
    const tasks: Task[] = [
      makeTask({
        id: 't-achieved-in-window',
        createdAt: cutoffDate - 2 * 7 * DAY,
        terminationDate: cutoffDate + 2 * 7 * DAY,
        impact: true,
        userId: 'user-A',
        triageStatus: 'Done',
      }),
      // Created 2 weeks ago (inside window) but achieved 6 weeks ago (outside)
      makeTask({
        id: 't-achieved-outside-window',
        createdAt: cutoffDate + 2 * 7 * DAY,
        terminationDate: cutoffDate - 2 * 7 * DAY,
        impact: true,
        userId: 'user-A',
        triageStatus: 'Done',
      }),
    ];

    const taskMap = Object.fromEntries(tasks.map(t => [t.id, t]));
    const highImpactMap: Record<string, boolean> = { 't-achieved-in-window': true, 't-achieved-outside-window': true };
    const userWorkloads: UserWorkload[] = [{ userId: 'user-A', workload: 100 }];

    const result = calculateHighImpactTaskFrequencyPerEFT(tasks, 4, userWorkloads, taskMap, highImpactMap);

    const totalEFT = 100 / 100;
    const expected = 1 / totalEFT / 4;

    expect(result).toBeCloseTo(expected, 4);
  });

  it('excludes Done tasks without a terminationDate even if recently updated', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({
        id: 't-no-termination',
        createdAt: cutoffDate - 6 * DAY,
        updatedAt: now - DAY,
        impact: true,
        userId: 'user-A',
        triageStatus: 'Done',
      }),
    ];

    const taskMap = Object.fromEntries(tasks.map(t => [t.id, t]));
    const highImpactMap: Record<string, boolean> = { 't-no-termination': true };
    const userWorkloads: UserWorkload[] = [{ userId: 'user-A', workload: 100 }];

    const result = calculateHighImpactTaskFrequencyPerEFT(tasks, 4, userWorkloads, taskMap, highImpactMap);

    expect(result).toBe(0);
  });

  it('counts only root tasks — Done subtasks under a Done high-impact parent are not counted', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({
        id: 'parent',
        createdAt: cutoffDate + DAY,
        terminationDate: cutoffDate + DAY,
        impact: true,
        userId: 'user-A',
        triageStatus: 'Done',
        children: ['child1', 'child2'],
      }),
      makeTask({ id: 'child1', createdAt: cutoffDate + DAY, terminationDate: cutoffDate + DAY, impact: false, parentId: 'parent', triageStatus: 'Done', userId: 'user-A' }),
      makeTask({ id: 'child2', createdAt: cutoffDate + DAY, terminationDate: cutoffDate + DAY, impact: false, parentId: 'parent', triageStatus: 'Done', userId: 'user-A' }),
    ];

    const taskMap = createTaskMap(tasks);
    const highImpactMap = createHighImpactMap(tasks, taskMap);
    const userWorkloads: UserWorkload[] = [{ userId: 'user-A', workload: 100 }];

    const result = calculateHighImpactTaskFrequencyPerEFT(tasks, 4, userWorkloads, taskMap, highImpactMap);

    const totalEFT = 100 / 100;
    const expected = 1 / totalEFT / 4;

    expect(result).toBeCloseTo(expected, 4);
  });

  it('excludes zero-workload users from high impact task frequency', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({
        id: 't1',
        createdAt: cutoffDate + DAY,
        terminationDate: cutoffDate + DAY,
        impact: true,
        userId: 'user-A',
        triageStatus: 'Done',
      }),
      makeTask({
        id: 't2',
        createdAt: cutoffDate + DAY,
        terminationDate: cutoffDate + DAY,
        impact: true,
        userId: 'user-Zero',
        triageStatus: 'Done',
      }),
    ];

    const taskMap = Object.fromEntries(tasks.map(t => [t.id, t]));
    const highImpactMap: Record<string, boolean> = { t1: true, t2: true };
    const userWorkloads: UserWorkload[] = [
      { userId: 'user-A', workload: 40 },
      { userId: 'user-Zero', workload: 0 },
    ];

    const result = calculateHighImpactTaskFrequencyPerEFT(
      tasks, 4, userWorkloads, taskMap, highImpactMap
    );

    const totalEFT = 40 / 100;
    const expected = 1 / totalEFT / 4;

    expect(result).toBeCloseTo(expected, 4);
  });

  it('returns 0 when all users have zero workload', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({
        id: 't1',
        createdAt: cutoffDate + DAY,
        terminationDate: cutoffDate + DAY,
        impact: true,
        userId: 'user-A',
        triageStatus: 'Done',
      }),
    ];

    const taskMap = Object.fromEntries(tasks.map(t => [t.id, t]));
    const highImpactMap: Record<string, boolean> = { t1: true };
    const userWorkloads: UserWorkload[] = [
      { userId: 'user-A', workload: 0 },
    ];

    const result = calculateHighImpactTaskFrequencyPerEFT(
      tasks, 4, userWorkloads, taskMap, highImpactMap
    );

    expect(result).toBe(0);
  });
});

describe('calculateFailureRate', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-04-08T12:00:00Z'));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('counts in-flight major incidents regardless of age (no window)', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    // Incident task created 6 weeks ago, still WIP — must count
    const tasks: Task[] = [
      makeTask({
        id: 't1',
        createdAt: cutoffDate - 2 * 7 * DAY,
        userId: 'user-A',
        triageStatus: 'WIP',
        majorIncident: true,
      }),
      makeTask({
        id: 't2',
        createdAt: cutoffDate + DAY,
        terminationDate: cutoffDate + DAY,
        userId: 'user-A',
        triageStatus: 'Done',
      }),
    ];

    const result = calculateFailureRate(tasks, 4);

    expect(result).toBeCloseTo(100, 1);
  });

  it('counts a Done major incident as an incident when achieved within the period', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({ id: 'major-done-in-window', createdAt: cutoffDate - 6 * DAY, terminationDate: cutoffDate + DAY, majorIncident: true, triageStatus: 'Done' }),
      makeTask({ id: 'major-done-outside-window', createdAt: cutoffDate + DAY, terminationDate: cutoffDate - 6 * DAY, majorIncident: true, triageStatus: 'Done' }),
      makeTask({ id: 'major-dropped', createdAt: cutoffDate + DAY, majorIncident: true, triageStatus: 'Dropped' }),
      makeTask({ id: 'major-archived', createdAt: cutoffDate + DAY, majorIncident: true, triageStatus: 'Archived' }),
      makeTask({ id: 'done-delivery', createdAt: cutoffDate + DAY, terminationDate: cutoffDate + DAY, triageStatus: 'Done' }),
      makeTask({ id: 'done-delivery-outside', createdAt: cutoffDate + DAY, terminationDate: cutoffDate - 6 * DAY, triageStatus: 'Done' }),
    ];

    const result = calculateFailureRate(tasks, 4);

    // 1 incident / 2 deliveries in period (the incident task itself is a
    // delivery) = 50%
    expect(result).toBeCloseTo(50, 1);
  });

  it('denominator counts only Done tasks achieved within the period', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({ id: 'backlog', createdAt: cutoffDate + DAY, triageStatus: 'Backlog' }),
      makeTask({ id: 'wip', createdAt: cutoffDate + DAY, triageStatus: 'WIP' }),
      makeTask({ id: 'done-in-period', createdAt: cutoffDate - 6 * DAY, terminationDate: cutoffDate + DAY, triageStatus: 'Done' }),
      makeTask({ id: 'done-outside-period', createdAt: cutoffDate + DAY, terminationDate: cutoffDate - 6 * DAY, triageStatus: 'Done' }),
      makeTask({ id: 'done-no-termination', createdAt: cutoffDate + DAY, triageStatus: 'Done' }),
      makeTask({ id: 'incident', createdAt: cutoffDate - 2 * 7 * DAY, triageStatus: 'WIP', majorIncident: true }),
    ];

    const result = calculateFailureRate(tasks, 4);

    // 1 incident / 1 delivery in period = 100%
    expect(result).toBeCloseTo(100, 1);
  });

  it('returns 0 when no Done tasks are in the period', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({ id: 't1', createdAt: cutoffDate + DAY, triageStatus: 'WIP', majorIncident: true }),
    ];

    const result = calculateFailureRate(tasks, 4);

    expect(result).toBe(0);
  });
});

describe('getCompletedHighImpactTasks - guard against Done/Dropped/Archived regression', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-04-08T12:00:00Z'));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('counts only Done tasks — Dropped high-impact tasks are excluded', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({ id: 't-done', createdAt: cutoffDate + DAY, terminationDate: cutoffDate + DAY, impact: true, triageStatus: 'Done' }),
      makeTask({ id: 't-dropped', createdAt: cutoffDate + DAY, impact: true, triageStatus: 'Dropped' }),
    ];

    const result = getCompletedHighImpactTasks(tasks, 4);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t-done');
  });

  it('counts only Done tasks — Archived high-impact tasks are excluded', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({ id: 't-done', createdAt: cutoffDate + DAY, terminationDate: cutoffDate + DAY, impact: true, triageStatus: 'Done' }),
      makeTask({ id: 't-archived', createdAt: cutoffDate + DAY, impact: true, triageStatus: 'Archived' }),
    ];

    const result = getCompletedHighImpactTasks(tasks, 4);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t-done');
  });

  it('excludes Done tasks achieved outside the time window', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({ id: 't-old', createdAt: cutoffDate - 2 * 7 * DAY, terminationDate: cutoffDate - DAY, impact: true, triageStatus: 'Done' }),
      makeTask({ id: 't-recent', createdAt: cutoffDate - 2 * 7 * DAY, terminationDate: cutoffDate + DAY, impact: true, triageStatus: 'Done' }),
    ];

    const result = getCompletedHighImpactTasks(tasks, 4);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t-recent');
  });

  it('excludes Done tasks without a terminationDate even if recently updated', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({ id: 't-no-termination', createdAt: cutoffDate + DAY, updatedAt: now - DAY, impact: true, triageStatus: 'Done' }),
    ];

    const result = getCompletedHighImpactTasks(tasks, 4);
    expect(result).toHaveLength(0);
  });

  it('excludes non-high-impact tasks even if Done', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({ id: 't-normal', createdAt: cutoffDate + DAY, terminationDate: cutoffDate + DAY, impact: false, triageStatus: 'Done' }),
      makeTask({ id: 't-impact', createdAt: cutoffDate + DAY, terminationDate: cutoffDate + DAY, impact: true, triageStatus: 'Done' }),
    ];

    const result = getCompletedHighImpactTasks(tasks, 4);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t-impact');
  });

  it('counts a high-impact root even when its Done children inherit impact', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({ id: 'parent', createdAt: cutoffDate + DAY, terminationDate: cutoffDate + DAY, impact: true, triageStatus: 'Done', children: ['child'] }),
      makeTask({ id: 'child', createdAt: cutoffDate + DAY, terminationDate: cutoffDate + DAY, impact: false, triageStatus: 'Done', parentId: 'parent' }),
    ];

    const taskMap = createTaskMap(tasks);
    const highImpactMap = createHighImpactMap(tasks, taskMap);

    // The child inherits impact (map semantics unchanged)...
    expect(highImpactMap['child']).toBe(true);

    // ...but only the root counts as an achieved unit
    const result = getCompletedHighImpactTasks(tasks, 4, taskMap, highImpactMap);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('parent');
  });

  it('does not count a high-impact child under a non-impact, non-Done parent', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({ id: 'parent', createdAt: cutoffDate + DAY, impact: false, triageStatus: 'WIP', children: ['child'] }),
      makeTask({ id: 'child', createdAt: cutoffDate + DAY, terminationDate: cutoffDate + DAY, impact: true, triageStatus: 'Done', parentId: 'parent' }),
    ];

    const taskMap = createTaskMap(tasks);
    const highImpactMap = createHighImpactMap(tasks, taskMap);

    const result = getCompletedHighImpactTasks(tasks, 4, taskMap, highImpactMap);
    expect(result).toHaveLength(0);
  });

  it('returns empty array when all tasks are Dropped/Archived/non-Done', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({ id: 't1', createdAt: cutoffDate + DAY, impact: true, triageStatus: 'Dropped' }),
      makeTask({ id: 't2', createdAt: cutoffDate + DAY, impact: true, triageStatus: 'Archived' }),
      makeTask({ id: 't3', createdAt: cutoffDate + DAY, impact: true, triageStatus: 'Backlog' }),
      makeTask({ id: 't4', createdAt: cutoffDate + DAY, impact: true, triageStatus: 'WIP' }),
    ];

    const result = getCompletedHighImpactTasks(tasks, 4);
    expect(result).toHaveLength(0);
  });

  it('returns empty array when no Done tasks are achieved in the time window', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({ id: 't1', createdAt: cutoffDate - 2 * 7 * DAY, terminationDate: cutoffDate - 2 * DAY, impact: true, triageStatus: 'Done' }),
      makeTask({ id: 't2', createdAt: cutoffDate - 10 * DAY, terminationDate: cutoffDate - 10 * DAY, impact: true, triageStatus: 'Done' }),
    ];

    const result = getCompletedHighImpactTasks(tasks, 4);
    expect(result).toHaveLength(0);
  });

  it('tasks exactly at cutoff date boundary are included (>=)', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({ id: 't-at', createdAt: cutoffDate - 2 * 7 * DAY, terminationDate: cutoffDate, impact: true, triageStatus: 'Done' }),
      makeTask({ id: 't-before', createdAt: cutoffDate - 2 * 7 * DAY, terminationDate: cutoffDate - 1, impact: true, triageStatus: 'Done' }),
    ];

    const result = getCompletedHighImpactTasks(tasks, 4);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t-at');
  });
});

describe('calculateHighImpactTaskFrequencyPerEFT - auto-parent completion guard', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-04-08T12:00:00Z'));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('auto-Done parent (via child completion) counts towards metric as a single unit', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({
        id: 'parent',
        createdAt: cutoffDate + DAY,
        terminationDate: now,
        impact: true,
        triageStatus: 'Done',
        userId: 'user-A',
        children: ['child1', 'child2'],
      }),
      makeTask({ id: 'child1', createdAt: cutoffDate + DAY, terminationDate: cutoffDate + DAY, impact: false, triageStatus: 'Done', parentId: 'parent', userId: 'user-A' }),
      makeTask({ id: 'child2', createdAt: cutoffDate + DAY, terminationDate: cutoffDate + DAY, impact: false, triageStatus: 'Done', parentId: 'parent', userId: 'user-A' }),
    ];

    const taskMap = createTaskMap(tasks);
    const highImpactMap = createHighImpactMap(tasks, taskMap);
    const userWorkloads: UserWorkload[] = [
      { userId: 'user-A', workload: 100 },
    ];

    const result = calculateHighImpactTaskFrequencyPerEFT(tasks, 4, userWorkloads, taskMap, highImpactMap);
    const totalEFT = 100 / 100;
    const expected = 1 / totalEFT / 4;

    expect(result).toBeCloseTo(expected, 4);
  });

  it('parent counted even if some children are Dropped (not Done)', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({
        id: 'parent',
        createdAt: cutoffDate + DAY,
        terminationDate: cutoffDate + DAY,
        impact: true,
        triageStatus: 'Done',
        userId: 'user-A',
        children: ['child'],
      }),
      makeTask({ id: 'child', createdAt: cutoffDate + DAY, impact: false, triageStatus: 'Dropped', parentId: 'parent', userId: 'user-A' }),
    ];

    const taskMap = createTaskMap(tasks);
    const highImpactMap = createHighImpactMap(tasks, taskMap);
    const userWorkloads: UserWorkload[] = [{ userId: 'user-A', workload: 100 }];

    const result = calculateHighImpactTaskFrequencyPerEFT(tasks, 4, userWorkloads, taskMap, highImpactMap);
    const totalEFT = 100 / 100;
    const expected = 1 / totalEFT / 4;
    expect(result).toBeCloseTo(expected, 4);
  });

  it('Dropped parent is NOT counted in high-impact task frequency', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({ id: 't1', createdAt: cutoffDate + DAY, impact: true, triageStatus: 'Dropped', userId: 'user-A' }),
    ];

    const taskMap = createTaskMap(tasks);
    const highImpactMap = createHighImpactMap(tasks, taskMap);
    const userWorkloads: UserWorkload[] = [{ userId: 'user-A', workload: 100 }];

    const result = calculateHighImpactTaskFrequencyPerEFT(tasks, 4, userWorkloads, taskMap, highImpactMap);
    expect(result).toBe(0);
  });
});
