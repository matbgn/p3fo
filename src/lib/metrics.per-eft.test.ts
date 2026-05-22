import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import {
  calculateTimeSpentOnNewCapabilitiesPerEFT,
  calculateHighImpactTaskFrequencyPerEFT,
  calculateFailureRatePerEFT,
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

describe('calculateTimeSpentOnNewCapabilitiesPerEFT', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-04-08T12:00:00Z'));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('weights each user percentage by workload in the EFT average', () => {
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
    const userWorkloads: UserWorkload[] = [
      { userId: 'user-A', workload: 40 },
      { userId: 'user-B', workload: 50 },
    ];

    const result = calculateTimeSpentOnNewCapabilitiesPerEFT(
      tasks, 4, taskMap, highImpactMap, userWorkloads
    );

    const eaPct = (5 * HOUR) / (5 * HOUR + 4 * HOUR) * 100;
    const jdrPct = 0;
    const expectedPct = (eaPct * 40 + jdrPct * 50) / (40 + 50);

    expect(expectedPct).toBeGreaterThan(20);
    expect(result.percentage).toBeCloseTo(expectedPct, 1);
  });

  it('does not dilute percentage when unassigned tasks have zero tracked time', () => {
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
      makeTask({
        id: 't4',
        createdAt: periodStart,
        impact: false,
        userId: '',
        timer: [],
      }),
      makeTask({
        id: 't5',
        createdAt: periodStart,
        impact: false,
        userId: 'unknown-user',
        timer: [],
      }),
    ];

    const taskMap = Object.fromEntries(tasks.map(t => [t.id, t]));
    const highImpactMap: Record<string, boolean> = { t1: true, t2: false, t3: false, t4: false, t5: false };
    const userWorkloads: UserWorkload[] = [
      { userId: 'user-A', workload: 40 },
      { userId: 'user-B', workload: 50 },
    ];

    const result = calculateTimeSpentOnNewCapabilitiesPerEFT(
      tasks, 4, taskMap, highImpactMap, userWorkloads
    );

    const eaPct = (5 * HOUR) / (5 * HOUR + 4 * HOUR) * 100;
    const expectedPct = (eaPct * 40 + 0 * 50) / (40 + 50);

    expect(result.percentage).toBeCloseTo(expectedPct, 1);
  });

  it('excludes zero-workload users from the weighted average', () => {
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
      makeTask({
        id: 't2',
        createdAt: periodStart,
        impact: false,
        userId: 'user-Zero',
        timer: [{ startTime: periodStart, endTime: periodStart + 40 * HOUR }],
      }),
    ];

    const taskMap = Object.fromEntries(tasks.map(t => [t.id, t]));
    const highImpactMap: Record<string, boolean> = { t1: true, t2: false };
    const userWorkloads: UserWorkload[] = [
      { userId: 'user-A', workload: 40 },
      { userId: 'user-Zero', workload: 0 },
    ];

    const result = calculateTimeSpentOnNewCapabilitiesPerEFT(
      tasks, 4, taskMap, highImpactMap, userWorkloads
    );

    expect(result.percentage).toBeCloseTo(100, 1);
  });

  it('returns 0 when all users have zero workload', () => {
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
    const userWorkloads: UserWorkload[] = [
      { userId: 'user-A', workload: 0 },
    ];

    const result = calculateTimeSpentOnNewCapabilitiesPerEFT(
      tasks, 4, taskMap, highImpactMap, userWorkloads
    );

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

  it('divides completed high-impact tasks by total EFT times weeks', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({
        id: 't1',
        createdAt: cutoffDate + DAY,
        impact: true,
        userId: 'user-A',
        triageStatus: 'Done',
      }),
      makeTask({
        id: 't2',
        createdAt: cutoffDate + DAY,
        impact: true,
        userId: 'user-A',
        triageStatus: 'Done',
      }),
      makeTask({
        id: 't3',
        createdAt: cutoffDate + DAY,
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

  it('excludes zero-workload users from high impact task frequency', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({
        id: 't1',
        createdAt: cutoffDate + DAY,
        impact: true,
        userId: 'user-A',
        triageStatus: 'Done',
      }),
      makeTask({
        id: 't2',
        createdAt: cutoffDate + DAY,
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

describe('calculateFailureRatePerEFT', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-04-08T12:00:00Z'));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('excludes zero-workload users from failure rate calculation', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({
        id: 't1',
        createdAt: cutoffDate + DAY,
        userId: 'user-A',
        majorIncident: true,
      }),
      makeTask({
        id: 't2',
        createdAt: cutoffDate + DAY,
        userId: 'user-A',
      }),
      makeTask({
        id: 't3',
        createdAt: cutoffDate + DAY,
        userId: 'user-B',
      }),
      makeTask({
        id: 't4',
        createdAt: cutoffDate + DAY,
        userId: 'user-B',
      }),
      makeTask({
        id: 't5',
        createdAt: cutoffDate + DAY,
        userId: 'user-Zero',
      }),
      makeTask({
        id: 't6',
        createdAt: cutoffDate + DAY,
        userId: 'user-Zero',
        majorIncident: true,
      }),
    ];

    const userWorkloads: UserWorkload[] = [
      { userId: 'user-A', workload: 40 },
      { userId: 'user-B', workload: 50 },
      { userId: 'user-Zero', workload: 0 },
    ];

    const result = calculateFailureRatePerEFT(tasks, 4, userWorkloads);

    const activeTasks = tasks.filter(t => t.userId !== 'user-Zero');
    const activeMajorIncidents = activeTasks.filter(t => t.majorIncident === true);
    const expected = (activeMajorIncidents.length / activeTasks.length) * 100;

    expect(result).toBeCloseTo(expected, 1);
  });

  it('returns 0 when all users have zero workload', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({
        id: 't1',
        createdAt: cutoffDate + DAY,
        userId: 'user-A',
        majorIncident: true,
      }),
    ];

    const userWorkloads: UserWorkload[] = [
      { userId: 'user-A', workload: 0 },
    ];

    const result = calculateFailureRatePerEFT(tasks, 4, userWorkloads);

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
      makeTask({ id: 't-done', createdAt: cutoffDate + DAY, impact: true, triageStatus: 'Done' }),
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
      makeTask({ id: 't-done', createdAt: cutoffDate + DAY, impact: true, triageStatus: 'Done' }),
      makeTask({ id: 't-archived', createdAt: cutoffDate + DAY, impact: true, triageStatus: 'Archived' }),
    ];

    const result = getCompletedHighImpactTasks(tasks, 4);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t-done');
  });

  it('excludes tasks outside the time window', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({ id: 't-old', createdAt: cutoffDate - DAY, impact: true, triageStatus: 'Done' }),
      makeTask({ id: 't-recent', createdAt: cutoffDate + DAY, impact: true, triageStatus: 'Done' }),
    ];

    const result = getCompletedHighImpactTasks(tasks, 4);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t-recent');
  });

  it('excludes non-high-impact tasks even if Done', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({ id: 't-normal', createdAt: cutoffDate + DAY, impact: false, triageStatus: 'Done' }),
      makeTask({ id: 't-impact', createdAt: cutoffDate + DAY, impact: true, triageStatus: 'Done' }),
    ];

    const result = getCompletedHighImpactTasks(tasks, 4);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t-impact');
  });

  it('recognizes high-impact from parent ancestor chain', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({ id: 'parent', createdAt: cutoffDate + DAY, impact: true, triageStatus: 'WIP', children: ['child'] }),
      makeTask({ id: 'child', createdAt: cutoffDate + DAY, impact: false, triageStatus: 'Done', parentId: 'parent' }),
    ];

    const taskMap = createTaskMap(tasks);
    const highImpactMap = createHighImpactMap(tasks, taskMap);

    expect(highImpactMap['child']).toBe(true);

    const result = getCompletedHighImpactTasks(tasks, 4, taskMap, highImpactMap);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('child');
  });

  it('deep ancestor chain: grandchild inherits high-impact from grandparent', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({ id: 'gp', createdAt: cutoffDate + DAY, impact: true, triageStatus: 'WIP', children: ['p'] }),
      makeTask({ id: 'p', createdAt: cutoffDate + DAY, impact: false, triageStatus: 'WIP', parentId: 'gp', children: ['gc'] }),
      makeTask({ id: 'gc', createdAt: cutoffDate + DAY, impact: false, triageStatus: 'Done', parentId: 'p' }),
    ];

    const taskMap = createTaskMap(tasks);
    const highImpactMap = createHighImpactMap(tasks, taskMap);

    expect(highImpactMap['gc']).toBe(true);
    expect(highImpactMap['p']).toBe(true);

    const result = getCompletedHighImpactTasks(tasks, 4, taskMap, highImpactMap);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('gc');
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

  it('returns empty array when no tasks are in the time window', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({ id: 't1', createdAt: cutoffDate - 2 * DAY, impact: true, triageStatus: 'Done' }),
      makeTask({ id: 't2', createdAt: cutoffDate - 10 * DAY, impact: true, triageStatus: 'Done' }),
    ];

    const result = getCompletedHighImpactTasks(tasks, 4);
    expect(result).toHaveLength(0);
  });

  it('tasks exactly at cutoff date boundary are included (>=)', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({ id: 't-at', createdAt: cutoffDate, impact: true, triageStatus: 'Done' }),
      makeTask({ id: 't-before', createdAt: cutoffDate - 1, impact: true, triageStatus: 'Done' }),
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

  it('auto-Done parent (via child completion) counts towards metric', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({
        id: 'parent',
        createdAt: cutoffDate + DAY,
        impact: true,
        triageStatus: 'Done',
        userId: 'user-A',
        terminationDate: now,
        children: ['child1', 'child2'],
      }),
      makeTask({ id: 'child1', createdAt: cutoffDate + DAY, impact: false, triageStatus: 'Done', parentId: 'parent', userId: 'user-A' }),
      makeTask({ id: 'child2', createdAt: cutoffDate + DAY, impact: false, triageStatus: 'Done', parentId: 'parent', userId: 'user-A' }),
    ];

    const taskMap = createTaskMap(tasks);
    const highImpactMap = createHighImpactMap(tasks, taskMap);
    const userWorkloads: UserWorkload[] = [
      { userId: 'user-A', workload: 100 },
    ];

    const result = calculateHighImpactTaskFrequencyPerEFT(tasks, 4, userWorkloads, taskMap, highImpactMap);
    expect(result).toBeGreaterThan(0);
  });

  it('parent counted even if some children are Dropped (not Done)', () => {
    const now = Date.now();
    const cutoffDate = now - 4 * 7 * DAY;

    const tasks: Task[] = [
      makeTask({
        id: 'parent',
        createdAt: cutoffDate + DAY,
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