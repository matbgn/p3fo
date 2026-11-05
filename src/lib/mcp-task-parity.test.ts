import { describe, expect, it } from 'vitest';
import { sortTasks as appSortTasks } from '@/utils/taskSorting';
import { aStarTextSearch as appAStarTextSearch } from '@/lib/a-star-search';
import { similarityRatio as appSimilarityRatio } from '@/lib/string-similarity';
import { sortTasksByMode } from '../../mcp-server/src/task-sorting';
import {
  aStarTextSearch as mcpAStarTextSearch,
  similarityRatio as mcpSimilarityRatio,
} from '../../mcp-server/src/task-search';
import type { TaskRecord } from '../../mcp-server/src/task-types';

function makeTask(overrides: Partial<TaskRecord> & { id: string }): TaskRecord {
  return {
    title: overrides.id,
    createdAt: 1_700_000_000_000,
    triageStatus: 'Backlog',
    priority: 0,
    urgent: false,
    impact: false,
    timer: [],
    ...overrides,
  };
}

const fixtures: TaskRecord[] = [
  makeTask({
    id: 'ready-timer',
    createdAt: 300,
    triageStatus: 'Ready',
    priority: 100,
    timer: [{ startTime: 1, endTime: 0 }],
  }),
  makeTask({
    id: 'blocked-urgent',
    createdAt: 200,
    triageStatus: 'Blocked',
    priority: 1,
    urgent: true,
  }),
  makeTask({
    id: 'backlog-impact',
    createdAt: 100,
    triageStatus: 'Backlog',
    priority: 0,
    impact: true,
    terminationDate: 5_000,
  }),
  makeTask({
    id: 'done-deadline',
    createdAt: 400,
    triageStatus: 'Done',
    priority: 5,
    terminationDate: 1_000,
  }),
  makeTask({
    id: 'wip-null-priority',
    createdAt: 50,
    triageStatus: 'WIP',
    priority: null,
    urgent: true,
    impact: true,
    timer: [{ startTime: 2, endTime: 0 }],
  }),
];

describe('MCP task sorting parity', () => {
  for (const mode of ['plan', 'taskboard', 'kanban'] as const) {
    it(`matches the app ${mode} ordering`, () => {
      const comparator = appSortTasks[mode] as unknown as (
        a: TaskRecord,
        b: TaskRecord,
      ) => number;
      const expected = [...fixtures].sort(comparator).map((task) => task.id);
      const actual = sortTasksByMode(fixtures, mode).map((task) => task.id);
      expect(actual).toEqual(expected);
    });
  }
});

describe('MCP task search parity', () => {
  const titles = [
    { id: 'a', title: 'Gutscheinkleber order' },
    { id: 'b', title: 'Fix cash balance Ticket#616795' },
    { id: 'c', title: 'Unrelated task' },
  ];

  it('matches the app A* search scores', () => {
    expect(mcpAStarTextSearch('gutschein', titles)).toEqual(appAStarTextSearch('gutschein', titles));
    expect(mcpAStarTextSearch('cash balance', titles)).toEqual(
      appAStarTextSearch('cash balance', titles),
    );
  });

  it('matches the app similarity ratio', () => {
    expect(mcpSimilarityRatio('Gutscheinkleber', 'Gutscheinklebber')).toBe(
      appSimilarityRatio('Gutscheinkleber', 'Gutscheinklebber'),
    );
  });
});
