import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import {
  getCompletedHighImpactTasks,
  calculateHighImpactTaskFrequencyPerEFT,
  calculateFailureRatePerEFT,
  calculateFailureRate,
  createTaskMap,
  createHighImpactMap,
  UserWorkload,
} from './metrics';
import type { Task, TriageStatus } from '@/hooks/useTasks';

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

describe('Metrics: Terminal Status Edge Cases', () => {
  let now: number;
  let cutoffDate: number;
  let recent: number;

  beforeEach(() => {
    vi.setSystemTime(new Date('2026-04-08T12:00:00Z'));
    now = Date.now();
    cutoffDate = now - 4 * 7 * DAY;
    recent = cutoffDate + DAY;
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  describe('getCompletedHighImpactTasks', () => {
    it('counts only Done tasks, not Dropped or Archived', () => {
      const tasks: Task[] = [
        makeTask({ id: 'done', createdAt: recent, impact: true, triageStatus: 'Done' }),
        makeTask({ id: 'dropped', createdAt: recent, impact: true, triageStatus: 'Dropped' }),
        makeTask({ id: 'archived', createdAt: recent, impact: true, triageStatus: 'Archived' }),
      ];

      const result = getCompletedHighImpactTasks(tasks, 4);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('done');
    });

    it('counts multiple Done tasks with impact', () => {
      const tasks: Task[] = [
        makeTask({ id: 'd1', createdAt: recent, impact: true, triageStatus: 'Done' }),
        makeTask({ id: 'd2', createdAt: recent, impact: true, triageStatus: 'Done' }),
        makeTask({ id: 'd3', createdAt: recent, impact: true, triageStatus: 'Done' }),
      ];

      const result = getCompletedHighImpactTasks(tasks, 4);
      expect(result).toHaveLength(3);
    });

    it('excludes Done tasks that are outside the time window', () => {
      const oldDate = cutoffDate - DAY;
      const tasks: Task[] = [
        makeTask({ id: 'old', createdAt: oldDate, impact: true, triageStatus: 'Done' }),
        makeTask({ id: 'recent', createdAt: recent, impact: true, triageStatus: 'Done' }),
      ];

      const result = getCompletedHighImpactTasks(tasks, 4);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('recent');
    });

    it('excludes Done tasks without impact', () => {
      const tasks: Task[] = [
        makeTask({ id: 'no-impact', createdAt: recent, impact: false, triageStatus: 'Done' }),
        makeTask({ id: 'with-impact', createdAt: recent, impact: true, triageStatus: 'Done' }),
      ];

      const result = getCompletedHighImpactTasks(tasks, 4);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('with-impact');
    });

    it('counts tasks with high-impact ancestor even if task itself is not high-impact', () => {
      const tasks: Task[] = [
        makeTask({ id: 'parent', createdAt: recent, impact: true, triageStatus: 'Done' }),
        makeTask({ id: 'child', createdAt: recent, impact: false, parentId: 'parent', triageStatus: 'Done' }),
      ];

      const taskMap = createTaskMap(tasks);
      const highImpactMap = createHighImpactMap(tasks, taskMap);
      const result = getCompletedHighImpactTasks(tasks, 4, taskMap, highImpactMap);
      expect(result).toHaveLength(2);
    });

    it('does not count Dropped high-impact child of high-impact parent', () => {
      const tasks: Task[] = [
        makeTask({ id: 'parent', createdAt: recent, impact: true, triageStatus: 'Done' }),
        makeTask({ id: 'dropped-child', createdAt: recent, impact: false, parentId: 'parent', triageStatus: 'Dropped' }),
      ];

      const taskMap = createTaskMap(tasks);
      const highImpactMap = createHighImpactMap(tasks, taskMap);
      const result = getCompletedHighImpactTasks(tasks, 4, taskMap, highImpactMap);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('parent');
    });

    it('does not count Archived high-impact tasks', () => {
      const tasks: Task[] = [
        makeTask({ id: 'archived-hi', createdAt: recent, impact: true, triageStatus: 'Archived' }),
        makeTask({ id: 'done-hi', createdAt: recent, impact: true, triageStatus: 'Done' }),
      ];

      const result = getCompletedHighImpactTasks(tasks, 4);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('done-hi');
    });

    it('returns empty array when all high-impact tasks are Dropped', () => {
      const tasks: Task[] = [
        makeTask({ id: 'd1', createdAt: recent, impact: true, triageStatus: 'Dropped' }),
        makeTask({ id: 'd2', createdAt: recent, impact: true, triageStatus: 'Dropped' }),
      ];

      const result = getCompletedHighImpactTasks(tasks, 4);
      expect(result).toHaveLength(0);
    });

    it('returns empty array when all high-impact tasks are Archived', () => {
      const tasks: Task[] = [
        makeTask({ id: 'a1', createdAt: recent, impact: true, triageStatus: 'Archived' }),
      ];

      const result = getCompletedHighImpactTasks(tasks, 4);
      expect(result).toHaveLength(0);
    });
  });

  describe('calculateHighImpactTaskFrequencyPerEFT with mixed statuses', () => {
    it('Dropped high-impact tasks do not inflate the metric', () => {
      const tasks: Task[] = [
        makeTask({ id: 'done', createdAt: recent, impact: true, userId: 'user-A', triageStatus: 'Done' }),
        makeTask({ id: 'dropped', createdAt: recent, impact: true, userId: 'user-A', triageStatus: 'Dropped' }),
        makeTask({ id: 'archived', createdAt: recent, impact: true, userId: 'user-A', triageStatus: 'Archived' }),
      ];

      const taskMap = createTaskMap(tasks);
      const highImpactMap = createHighImpactMap(tasks, taskMap);
      const userWorkloads: UserWorkload[] = [{ userId: 'user-A', workload: 60 }];

      const result = calculateHighImpactTaskFrequencyPerEFT(tasks, 4, userWorkloads, taskMap, highImpactMap);

      const totalEFT = 60 / 100;
      expect(result).toBeCloseTo(1 / totalEFT / 4, 4);
    });

    it('Done task then reverted to WIP is not counted', () => {
      const tasks: Task[] = [
        makeTask({ id: 'reverted', createdAt: recent, impact: true, userId: 'user-A', triageStatus: 'WIP' }),
        makeTask({ id: 'still-done', createdAt: recent, impact: true, userId: 'user-A', triageStatus: 'Done' }),
      ];

      const taskMap = createTaskMap(tasks);
      const highImpactMap = createHighImpactMap(tasks, taskMap);
      const userWorkloads: UserWorkload[] = [{ userId: 'user-A', workload: 60 }];

      const result = calculateHighImpactTaskFrequencyPerEFT(tasks, 4, userWorkloads, taskMap, highImpactMap);

      const totalEFT = 60 / 100;
      expect(result).toBeCloseTo(1 / totalEFT / 4, 4);
    });

    it('parent auto-completed by children Done counts parent + children with inherited impact', () => {
      const tasks: Task[] = [
        makeTask({ id: 'parent', createdAt: recent, impact: true, userId: 'user-A', triageStatus: 'Done', children: ['child1', 'child2'] }),
        makeTask({ id: 'child1', createdAt: recent, impact: false, userId: 'user-A', triageStatus: 'Done', parentId: 'parent' }),
        makeTask({ id: 'child2', createdAt: recent, impact: false, userId: 'user-A', triageStatus: 'Done', parentId: 'parent' }),
      ];

      const taskMap = createTaskMap(tasks);
      const highImpactMap = createHighImpactMap(tasks, taskMap);
      const userWorkloads: UserWorkload[] = [{ userId: 'user-A', workload: 60 }];

      const result = calculateHighImpactTaskFrequencyPerEFT(tasks, 4, userWorkloads, taskMap, highImpactMap);

      const totalEFT = 60 / 100;
      // Parent + both children (which inherit impact from parent) = 3 counted
      expect(result).toBeCloseTo(3 / totalEFT / 4, 4);
    });

    it('parent auto-Dropped is NOT counted (only Done counts)', () => {
      const tasks: Task[] = [
        makeTask({ id: 'parent', createdAt: recent, impact: true, userId: 'user-A', triageStatus: 'Dropped', children: ['child1'] }),
        makeTask({ id: 'child1', createdAt: recent, impact: false, userId: 'user-A', triageStatus: 'Dropped', parentId: 'parent' }),
      ];

      const taskMap = createTaskMap(tasks);
      const highImpactMap = createHighImpactMap(tasks, taskMap);
      const userWorkloads: UserWorkload[] = [{ userId: 'user-A', workload: 60 }];

      const result = calculateHighImpactTaskFrequencyPerEFT(tasks, 4, userWorkloads, taskMap, highImpactMap);

      expect(result).toBe(0);
    });
  });

  describe('calculateFailureRate with terminal status tasks', () => {
    it('counts major incidents regardless of task status', () => {
      const tasks: Task[] = [
        makeTask({ id: 'major-done', createdAt: recent, majorIncident: true, triageStatus: 'Done' }),
        makeTask({ id: 'major-dropped', createdAt: recent, majorIncident: true, triageStatus: 'Dropped' }),
        makeTask({ id: 'major-archived', createdAt: recent, majorIncident: true, triageStatus: 'Archived' }),
        makeTask({ id: 'normal', createdAt: recent, triageStatus: 'WIP' }),
      ];

      const result = calculateFailureRate(tasks, 4);
      expect(result).toBeCloseTo(75, 1);
    });

    it('counts all tasks in period for denominator regardless of status', () => {
      const tasks: Task[] = [
        makeTask({ id: 't1', createdAt: recent, triageStatus: 'Done' }),
        makeTask({ id: 't2', createdAt: recent, triageStatus: 'Dropped' }),
        makeTask({ id: 't3', createdAt: recent, triageStatus: 'Archived' }),
        makeTask({ id: 't4', createdAt: recent, triageStatus: 'WIP' }),
        makeTask({ id: 't5', createdAt: recent, majorIncident: true, triageStatus: 'Done' }),
      ];

      const result = calculateFailureRate(tasks, 4);
      expect(result).toBeCloseTo(20, 1);
    });

    it('excludes tasks outside the time window from failure rate', () => {
      const oldDate = cutoffDate - DAY;
      const tasks: Task[] = [
        makeTask({ id: 'old-incident', createdAt: oldDate, majorIncident: true }),
        makeTask({ id: 'recent-normal', createdAt: recent }),
      ];

      const result = calculateFailureRate(tasks, 4);
      expect(result).toBe(0);
    });
  });

  describe('calculateFailureRatePerEFT with terminal status tasks', () => {
    it('excludes zero-workload users even if they have major incidents', () => {
      const tasks: Task[] = [
        makeTask({ id: 'active-incident', createdAt: recent, userId: 'active', majorIncident: true }),
        makeTask({ id: 'active-normal', createdAt: recent, userId: 'active' }),
        makeTask({ id: 'zero-incident', createdAt: recent, userId: 'zero', majorIncident: true }),
        makeTask({ id: 'zero-normal', createdAt: recent, userId: 'zero' }),
      ];

      const userWorkloads: UserWorkload[] = [
        { userId: 'active', workload: 60 },
        { userId: 'zero', workload: 0 },
      ];

      const result = calculateFailureRatePerEFT(tasks, 4, userWorkloads);
      expect(result).toBeCloseTo(50, 1);
    });
  });

  describe('createHighImpactMap edge cases', () => {
    it('walks up entire parent chain for high-impact', () => {
      const tasks: Task[] = [
        makeTask({ id: 'grandparent', createdAt: recent, impact: true }),
        makeTask({ id: 'parent', createdAt: recent, impact: false, parentId: 'grandparent' }),
        makeTask({ id: 'child', createdAt: recent, impact: false, parentId: 'parent' }),
      ];

      const taskMap = createTaskMap(tasks);
      const highImpactMap = createHighImpactMap(tasks, taskMap);

      expect(highImpactMap['grandparent']).toBe(true);
      expect(highImpactMap['parent']).toBe(true);
      expect(highImpactMap['child']).toBe(true);
    });

    it('task with no impact and no parent is not high-impact', () => {
      const tasks: Task[] = [
        makeTask({ id: 'orphan', createdAt: recent, impact: false, parentId: null }),
      ];

      const taskMap = createTaskMap(tasks);
      const highImpactMap = createHighImpactMap(tasks, taskMap);

      expect(highImpactMap['orphan']).toBe(false);
    });

    it('handles broken parent chain gracefully', () => {
      const tasks: Task[] = [
        makeTask({ id: 'child', createdAt: recent, impact: false, parentId: 'nonexistent' }),
      ];

      const taskMap = createTaskMap(tasks);
      const highImpactMap = createHighImpactMap(tasks, taskMap);

      expect(highImpactMap['child']).toBe(false);
    });
  });

  describe('Archived status isolation', () => {
    it('Archived tasks with impact do not appear in any Done metric', () => {
      const tasks: Task[] = [
        makeTask({ id: 'archived', createdAt: recent, impact: true, triageStatus: 'Archived' }),
        makeTask({ id: 'done', createdAt: recent, impact: true, triageStatus: 'Done' }),
      ];

      const completed = getCompletedHighImpactTasks(tasks, 4);
      expect(completed).toHaveLength(1);
      expect(completed[0].id).toBe('done');
    });

    it('transition from Done to Archived removes task from completed metrics', () => {
      const doneTasks: Task[] = [
        makeTask({ id: 't1', createdAt: recent, impact: true, triageStatus: 'Done' }),
      ];
      expect(getCompletedHighImpactTasks(doneTasks, 4)).toHaveLength(1);

      const archivedTasks: Task[] = [
        makeTask({ id: 't1', createdAt: recent, impact: true, triageStatus: 'Archived' }),
      ];
      expect(getCompletedHighImpactTasks(archivedTasks, 4)).toHaveLength(0);
    });

    it('transition from Done to Dropped removes task from completed metrics', () => {
      const droppedTasks: Task[] = [
        makeTask({ id: 't1', createdAt: recent, impact: true, triageStatus: 'Dropped' }),
      ];
      expect(getCompletedHighImpactTasks(droppedTasks, 4)).toHaveLength(0);
    });

    it('transition from Dropped to Done adds task back to completed metrics', () => {
      const nowDoneTasks: Task[] = [
        makeTask({ id: 't1', createdAt: recent, impact: true, triageStatus: 'Done' }),
      ];
      expect(getCompletedHighImpactTasks(nowDoneTasks, 4)).toHaveLength(1);
    });
  });

  describe('checkParentTaskCompletion behavioral contract', () => {
    it('parent with all Done children is Done and counted in metrics (parent + child both done)', () => {
      const tasks: Task[] = [
        makeTask({ id: 'parent', createdAt: recent, impact: true, userId: 'user-A', triageStatus: 'Done', children: ['c1'] }),
        makeTask({ id: 'c1', createdAt: recent, impact: false, userId: 'user-A', triageStatus: 'Done', parentId: 'parent' }),
      ];

      const userWorkloads: UserWorkload[] = [{ userId: 'user-A', workload: 60 }];
      const totalEFT = 60 / 100;

      const taskMap = createTaskMap(tasks);
      const highImpactMap = createHighImpactMap(tasks, taskMap);
      const result = calculateHighImpactTaskFrequencyPerEFT(tasks, 4, userWorkloads, taskMap, highImpactMap);

      // Both parent (impact=true) and child (inherits impact from parent) are counted
      expect(result).toBeCloseTo(2 / totalEFT / 4, 4);
    });

    it('parent with all Dropped children results in Dropped parent (not counted)', () => {
      const tasks: Task[] = [
        makeTask({ id: 'parent', createdAt: recent, impact: true, userId: 'user-A', triageStatus: 'Dropped', children: ['c1'] }),
        makeTask({ id: 'c1', createdAt: recent, impact: false, userId: 'user-A', triageStatus: 'Dropped', parentId: 'parent' }),
      ];

      const userWorkloads: UserWorkload[] = [{ userId: 'user-A', workload: 60 }];

      const taskMap = createTaskMap(tasks);
      const highImpactMap = createHighImpactMap(tasks, taskMap);
      const result = calculateHighImpactTaskFrequencyPerEFT(tasks, 4, userWorkloads, taskMap, highImpactMap);

      expect(result).toBe(0);
    });

    it('parent with mixed Done and Dropped children: parent + Done child counted, Dropped child excluded', () => {
      const tasks: Task[] = [
        makeTask({ id: 'parent', createdAt: recent, impact: true, userId: 'user-A', triageStatus: 'Done', children: ['c1', 'c2'] }),
        makeTask({ id: 'c1', createdAt: recent, impact: false, userId: 'user-A', triageStatus: 'Done', parentId: 'parent' }),
        makeTask({ id: 'c2', createdAt: recent, impact: false, userId: 'user-A', triageStatus: 'Dropped', parentId: 'parent' }),
      ];

      const userWorkloads: UserWorkload[] = [{ userId: 'user-A', workload: 60 }];
      const totalEFT = 60 / 100;

      const taskMap = createTaskMap(tasks);
      const highImpactMap = createHighImpactMap(tasks, taskMap);
      const result = calculateHighImpactTaskFrequencyPerEFT(tasks, 4, userWorkloads, taskMap, highImpactMap);

      // Parent (impact=true) + c1 (inherits impact, Done) = 2 counted. c2 (Dropped) excluded.
      expect(result).toBeCloseTo(2 / totalEFT / 4, 4);
    });

    it('parent reverted from Done to Ready when a child is un-Done is no longer counted', () => {
      const tasks: Task[] = [
        makeTask({ id: 'parent', createdAt: recent, impact: true, userId: 'user-A', triageStatus: 'Ready', children: ['c1'] }),
        makeTask({ id: 'c1', createdAt: recent, impact: false, userId: 'user-A', triageStatus: 'WIP', parentId: 'parent' }),
      ];

      const userWorkloads: UserWorkload[] = [{ userId: 'user-A', workload: 60 }];

      const taskMap = createTaskMap(tasks);
      const highImpactMap = createHighImpactMap(tasks, taskMap);
      const result = calculateHighImpactTaskFrequencyPerEFT(tasks, 4, userWorkloads, taskMap, highImpactMap);

      expect(result).toBe(0);
    });
  });

  describe('status transition matrix for metrics', () => {
    const statusTransitions: { from: TriageStatus; to: TriageStatus; counted: boolean }[] = [
      { from: 'Backlog', to: 'Done', counted: true },
      { from: 'Ready', to: 'Done', counted: true },
      { from: 'WIP', to: 'Done', counted: true },
      { from: 'Blocked', to: 'Done', counted: true },
      { from: 'Done', to: 'Dropped', counted: false },
      { from: 'Done', to: 'Archived', counted: false },
      { from: 'Dropped', to: 'Done', counted: true },
      { from: 'Archived', to: 'Done', counted: true },
      { from: 'Done', to: 'Ready', counted: false },
      { from: 'Done', to: 'WIP', counted: false },
    ];

    statusTransitions.forEach(({ from, to, counted }) => {
      it(`transition ${from} → ${to} results in ${counted ? 'counted' : 'not counted'} in metrics`, () => {
        const tasks: Task[] = [
          makeTask({ id: 't1', createdAt: recent, impact: true, triageStatus: to }),
        ];

        const result = getCompletedHighImpactTasks(tasks, 4);
        expect(result).toHaveLength(counted ? 1 : 0);
      });
    });
  });
});