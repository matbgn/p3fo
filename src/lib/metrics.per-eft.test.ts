import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import {
  calculateTimeSpentOnNewCapabilitiesPerEFT,
  calculateHighImpactTaskFrequencyPerEFT,
  calculateFailureRatePerEFT,
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