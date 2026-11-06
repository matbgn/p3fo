import { describe, expect, it } from 'vitest';
import {
  MIN_WELLBEING_RESPONDENTS,
  SPRINT_CHECKLIST,
  aggregateWellbeing,
  applyClose,
  buildBurndown,
  buildNextDraft,
  buildScopeSnapshot,
  buildWellbeingAggregate,
  computeCapacity,
  computeSprintMetrics,
  createEmptyMetrics,
  planAutoClose,
  reconcileChecklist,
  resolveAutoCloseDueAt,
  type SprintEntity,
  type SprintTaskLike,
} from './sprint-types';
import { sweepSprintState } from './sprint-autoclose';

const DAY = 86_400_000;
const START = '2026-10-03';
const END = '2026-10-30';
const inRange = Date.parse('2026-10-20T10:00:00Z');

function sprint(overrides: Partial<SprintEntity> = {}): SprintEntity {
  return {
    id: 'sprint-1',
    name: 'Sprint test',
    goal: '',
    status: 'active',
    startDate: START,
    endDate: END,
    createdAt: '2026-10-03T00:00:00Z',
    updatedAt: '2026-10-03T00:00:00Z',
    scope: [],
    capacity: computeCapacity({ theoreticalPoints: 70, practicePct: 60, eftCount: 1, workingDays: 20 }),
    metrics: createEmptyMetrics(),
    ...overrides,
  };
}

function task(overrides: Partial<SprintTaskLike> & { id: string }): SprintTaskLike {
  return {
    title: overrides.id,
    triageStatus: 'Ready',
    difficulty: 1,
    impact: false,
    category: 'Development',
    children: [],
    ...overrides,
  };
}

describe('sprint capacity', () => {
  it('reproduces 70 x 60% = 42', () => {
    const capacity = computeCapacity({ theoreticalPoints: 70, practicePct: 60, eftCount: 1, workingDays: 20 });
    expect(capacity.costPerDayPct).toBeCloseTo(3);
    expect(capacity.targetPoints).toBeCloseTo(42);
  });

  it('subtracts impediment days at practice% / people / days', () => {
    const capacity = computeCapacity({
      theoreticalPoints: 70,
      practicePct: 60,
      eftCount: 1,
      workingDays: 20,
      impediments: [{ id: 'i1', label: 'Workshop', days: 2.5 }],
    });
    expect(capacity.impedimentDays).toBe(2.5);
    expect(capacity.costPerDayPct).toBeCloseTo(3);
    expect(capacity.correctedPct).toBeCloseTo(52.5);
    expect(capacity.targetPoints).toBeCloseTo(36.75);
    expect(Math.round(capacity.targetPoints)).toBe(37);
  });

  it('scales cost per day with two people', () => {
    const capacity = computeCapacity({ theoreticalPoints: 70, practicePct: 100, eftCount: 2, workingDays: 20 });
    expect(capacity.costPerDayPct).toBeCloseTo(2.5);
  });

  it('normalizes a legacy fractional practice value to percentage points', () => {
    const capacity = computeCapacity({ theoreticalPoints: 70, practicePct: 0.6, eftCount: 1, workingDays: 20 });
    expect(capacity.practicePct).toBe(60);
    expect(capacity.targetPoints).toBe(42);
  });

  it('keeps EFT counts above five instead of treating them as percentages', () => {
    const capacity = computeCapacity({ theoreticalPoints: 70, practicePct: 60, eftCount: 6, workingDays: 20 });
    expect(capacity.eftCount).toBe(6);
    expect(capacity.costPerDayPct).toBeCloseTo(0.5);
    expect(capacity.targetPoints).toBe(42);
  });
});

describe('sprint metrics', () => {
  const tasks = [
    task({ id: 'a', title: 'Done impact', triageStatus: 'Done', difficulty: 8, impact: true, terminationDate: inRange }),
    task({ id: 'b', title: 'Done dev', triageStatus: 'Done', difficulty: 5, impact: true, terminationDate: inRange }),
    task({ id: 'c', title: 'Done admin', triageStatus: 'Done', difficulty: 3, impact: true, category: 'Admin', terminationDate: inRange }),
    task({ id: 'd', title: 'Open', triageStatus: 'Ready', difficulty: 2, impact: true }),
    task({ id: 'e', title: 'Unplanned done', triageStatus: 'Done', difficulty: 1, impact: true, terminationDate: inRange }),
  ];

  it('splits scope completion from High Impact velocity', () => {
    const scope = buildScopeSnapshot(['a', 'b', 'd'], tasks);
    const entity = sprint({ scope });
    const metrics = computeSprintMetrics(entity, tasks, 42);
    expect(metrics.committedPoints).toBe(15);
    expect(metrics.scopeDonePoints).toBe(13);
    expect(metrics.openPoints).toBe(2);
    // Impact + Done + non-Admin in range: a(8) + b(5) + e(1) = 14; Admin c excluded.
    expect(metrics.achievedPoints).toBe(14);
    expect(metrics.unplannedDonePoints).toBe(4);
    expect(metrics.completionPct).toBeCloseTo(86.7, 1);
    expect(metrics.errorPct).toBeCloseTo(-66.7, 1);
  });

  it('uses the recursive subtree points', () => {
    const tasks = [
      task({ id: 'parent', title: 'Parent', difficulty: 1, children: ['child'] }),
      task({ id: 'child', title: 'Child', difficulty: 5, parentId: 'parent' }),
    ];
    const scope = buildScopeSnapshot(['parent'], tasks);
    expect(scope).toHaveLength(1);
    expect(scope[0].points).toBe(5);
  });

  it('does not count a Done task whose terminationDate is outside the range', () => {
    const tasks = [task({ id: 'late', triageStatus: 'Done', difficulty: 8, impact: true, terminationDate: Date.parse('2026-11-05T10:00:00Z') })];
    const entity = sprint({ scope: buildScopeSnapshot(['late'], tasks) });
    const metrics = computeSprintMetrics(entity, tasks, 0);
    expect(metrics.scopeDonePoints).toBe(0);
    expect(metrics.achievedPoints).toBe(0);
  });

  it('burns down only Done tasks inside the range', () => {
    const tasks = [
      task({ id: 'a', triageStatus: 'Done', difficulty: 8, impact: true, terminationDate: Date.parse('2026-10-10T10:00:00Z') }),
      task({ id: 'b', triageStatus: 'Done', difficulty: 5, impact: true, terminationDate: Date.parse('2026-11-10T10:00:00Z') }),
      task({ id: 'c', triageStatus: 'Ready', difficulty: 2, impact: true }),
      // Historical Done work must not burn the current sprint.
      task({ id: 'old', triageStatus: 'Done', difficulty: 10, impact: true, terminationDate: Date.parse('2026-09-20T10:00:00Z') }),
    ];
    const entity = sprint({ scope: buildScopeSnapshot(['a', 'b', 'c'], tasks) });
    const points = buildBurndown(entity, tasks);
    // The chart opens at the capacity target, not at the sprint-goal points.
    expect(points[0]).toEqual({ date: '2026-10-03', remaining: 42, ideal: 42 });
    const before = points.find((point) => point.date === '2026-10-09');
    const after = points.find((point) => point.date === '2026-10-11');
    expect(before?.remaining).toBe(42);
    expect(after?.remaining).toBe(34);
    expect(points[points.length - 1].remaining).toBe(34);
  });
});

describe('auto-close', () => {
  it('resolves the end of the first day after the sprint', () => {
    expect(new Date(resolveAutoCloseDueAt('2026-10-30', 24, 'Europe/Zurich')).toISOString()).toBe(
      '2026-10-31T22:59:59.000Z',
    );
    expect(new Date(resolveAutoCloseDueAt('2026-10-30', 0, 'Europe/Zurich')).toISOString()).toBe(
      '2026-10-30T22:59:59.000Z',
    );
  });

  it('handles the DST change day', () => {
    expect(new Date(resolveAutoCloseDueAt('2026-10-24', 24, 'Europe/Zurich')).toISOString()).toBe(
      '2026-10-25T22:59:59.000Z',
    );
  });

  it('carries in current Storyboard order up to the target', () => {
    const tasks = [
      task({ id: 'low', title: 'Low', triageStatus: 'Ready', difficulty: 2, priority: 30 }),
      task({ id: 'high', title: 'High', triageStatus: 'Ready', difficulty: 3, priority: 10 }),
      task({ id: 'mid', title: 'Mid', triageStatus: 'Blocked', difficulty: 4, priority: 20 }),
    ];
    const entity = sprint({
      scope: buildScopeSnapshot(['low', 'high', 'mid'], tasks),
      autoClose: {
        enabled: true,
        graceHours: 24,
        dueAt: 0,
        policy: 'storyboard',
        createNextDraft: true,
        notify: true,
        armedBy: 'test',
        armedAt: '',
        status: 'armed',
      },
    });
    const plan = planAutoClose(entity, tasks, { policy: 'storyboard' });
    // Goals are a small set: the Storyboard policy carries every open goal in order.
    expect(plan.carriedTaskIds).toEqual(['high', 'mid', 'low']);
    expect(plan.outcomes.low).toBe('carried');
    expect(plan.carriedPoints).toBe(9);
  });

  it('excludes terminal tasks from the open plan regardless of the window', () => {
    const tasks = [
      task({ id: 'done-in-range', triageStatus: 'Done', difficulty: 2, terminationDate: inRange }),
      task({
        id: 'done-late',
        triageStatus: 'Done',
        difficulty: 3,
        terminationDate: Date.parse('2026-11-05T10:00:00Z'),
      }),
      task({ id: 'dropped', triageStatus: 'Dropped', difficulty: 4 }),
      task({ id: 'archived', triageStatus: 'Archived', difficulty: 5 }),
      task({ id: 'ready', triageStatus: 'Ready', difficulty: 6 }),
    ];
    const entity = sprint({
      scope: buildScopeSnapshot(['done-in-range', 'done-late', 'dropped', 'archived', 'ready'], tasks),
    });
    const plan = planAutoClose(entity, tasks, { policy: 'carry-all' });
    expect(plan.carriedTaskIds).toEqual(['ready']);
    expect(plan.carriedPoints).toBe(6);
    expect(plan.outcomes['done-late']).toBeUndefined();
    expect(plan.outcomes.dropped).toBeUndefined();
    expect(plan.outcomes.archived).toBeUndefined();
  });

  it('honors prepared per-item outcomes under the preselected policy', () => {
    const tasks = [
      task({ id: 'prep-backlog', triageStatus: 'Ready', difficulty: 2 }),
      task({ id: 'prep-dropped', triageStatus: 'Ready', difficulty: 3 }),
      task({ id: 'carry-me', triageStatus: 'Ready', difficulty: 4 }),
    ];
    const scope = buildScopeSnapshot(['prep-backlog', 'prep-dropped', 'carry-me'], tasks).map((item) => {
      if (item.taskId === 'prep-backlog') return { ...item, outcome: 'backlog' as const };
      if (item.taskId === 'prep-dropped') return { ...item, outcome: 'dropped' as const };
      return item;
    });
    const entity = sprint({ scope });
    const plan = planAutoClose(entity, tasks, { policy: 'preselected' });
    expect(plan.outcomes['prep-backlog']).toBe('backlog');
    expect(plan.outcomes['prep-dropped']).toBe('dropped');
    expect(plan.outcomes['carry-me']).toBe('carried');
    expect(plan.carriedTaskIds).toEqual(['carry-me']);
    expect(plan.backlogPoints).toBe(2);
    expect(plan.carriedPoints).toBe(4);
  });

  it('aggregates WHO-5 anonymously', () => {
    const aggregate = aggregateWellbeing([
      [5, 5, 5, 5, 5],
      [0, 0, 0, 0, 0],
    ]);
    expect(aggregate.count).toBe(2);
    expect(aggregate.meanRaw).toBe(12.5);
    expect(aggregate.score).toBe(50);
  });

  it('suppresses wellbeing aggregates below three respondents', () => {
    expect(MIN_WELLBEING_RESPONDENTS).toBe(3);
    expect(
      buildWellbeingAggregate([
        [5, 5, 5, 5, 5],
        [0, 0, 0, 0, 0],
      ]),
    ).toBeNull();
    const aggregate = buildWellbeingAggregate([
      [5, 5, 5, 5, 5],
      [0, 0, 0, 0, 0],
      [1, 1, 1, 1, 1],
    ]);
    expect(aggregate).not.toBeNull();
    expect(aggregate?.count).toBe(3);
    expect(aggregate?.meanRaw).toBe(10);
    expect(aggregate?.score).toBe(40);
  });

  it('closes with outcomes and computes velocity against the frozen target', () => {
    const tasks = [
      task({ id: 'a', triageStatus: 'Done', difficulty: 8, impact: true, terminationDate: inRange }),
      task({ id: 'b', triageStatus: 'Ready', difficulty: 3 }),
    ];
    const entity = sprint({ scope: buildScopeSnapshot(['a', 'b'], tasks) });
    const closed = applyClose(entity, tasks, { b: 'carried' }, 42, 'auto');
    expect(closed.status).toBe('closed');
    expect(closed.closedBy).toBe('auto');
    expect(closed.scope.find((item) => item.taskId === 'a')?.outcome).toBe('done');
    expect(closed.scope.find((item) => item.taskId === 'b')?.outcome).toBe('carried');
    expect(closed.metrics.scopeDonePoints).toBe(8);
    expect(closed.metrics.carriedPoints).toBe(3);
    expect(closed.metrics.achievedPoints).toBe(8);
  });

  it('closes terminal tasks as done or dropped instead of carrying them', () => {
    const tasks = [
      task({
        id: 'late-done',
        triageStatus: 'Done',
        difficulty: 3,
        terminationDate: Date.parse('2026-11-05T10:00:00Z'),
      }),
      task({ id: 'dropped', triageStatus: 'Dropped', difficulty: 4 }),
      task({ id: 'archived', triageStatus: 'Archived', difficulty: 5 }),
      task({ id: 'open', triageStatus: 'Ready', difficulty: 2 }),
    ];
    const entity = sprint({
      scope: buildScopeSnapshot(['late-done', 'dropped', 'archived', 'open'], tasks),
    });
    const closed = applyClose(
      entity,
      tasks,
      { 'late-done': 'carried', dropped: 'carried', archived: 'carried', open: 'backlog' },
      42,
      'auto',
    );
    expect(closed.scope.find((item) => item.taskId === 'late-done')?.outcome).toBe('done');
    expect(closed.scope.find((item) => item.taskId === 'dropped')?.outcome).toBe('dropped');
    expect(closed.scope.find((item) => item.taskId === 'archived')?.outcome).toBe('dropped');
    expect(closed.scope.find((item) => item.taskId === 'open')?.outcome).toBe('backlog');
  });

  it('never seeds the next draft with terminal tasks passed as carried', () => {
    const tasks = [
      task({ id: 'open', triageStatus: 'Ready', difficulty: 2 }),
      task({
        id: 'late-done',
        triageStatus: 'Done',
        difficulty: 3,
        terminationDate: Date.parse('2026-11-05T10:00:00Z'),
      }),
      task({ id: 'dropped', triageStatus: 'Dropped', difficulty: 4 }),
    ];
    const closed = sprint({
      status: 'closed',
      scope: buildScopeSnapshot(['open', 'late-done', 'dropped'], tasks),
    });
    const draft = buildNextDraft(closed, ['open', 'late-done', 'dropped'], tasks, closed.capacity);
    expect(draft).not.toBeNull();
    expect(draft?.scope.map((item) => item.taskId)).toEqual(['open']);

    const terminalOnly = buildNextDraft(closed, ['late-done', 'dropped'], tasks, closed.capacity);
    expect(terminalOnly).toBeNull();
  });
});


describe('auto-close sweep', () => {
  it('closes a due sprint, creates the next draft and returns task flags', () => {
    const tasks = [
      task({ id: 'a', triageStatus: 'Done', difficulty: 8, impact: true, terminationDate: inRange }),
      task({ id: 'b', triageStatus: 'Ready', difficulty: 3 }),
      task({ id: 'c', triageStatus: 'Blocked', difficulty: 2 }),
    ];
    const entity = sprint({
      scope: buildScopeSnapshot(['a', 'b', 'c'], tasks),
      autoClose: {
        enabled: true,
        graceHours: 24,
        dueAt: Date.parse('2026-10-31T22:59:59Z'),
        policy: 'carry-all',
        createNextDraft: true,
        notify: true,
        armedBy: 'test',
        armedAt: '2026-10-03T00:00:00Z',
        status: 'armed',
      },
    });
    const result = sweepSprintState(
      { activeSprintId: entity.id, draftSprintId: null, sprints: [entity] },
      tasks,
      Date.parse('2026-11-01T00:00:00Z'),
    );
    expect(result.changed).toBe(true);
    expect(result.closedSprintIds).toEqual([entity.id]);
    expect(result.state.sprints).toHaveLength(2);
    expect(result.state.sprints[0].status).toBe('closed');
    expect(result.state.sprints[1].status).toBe('draft');
    expect(result.state.sprints[1].scope.map((item) => item.taskId).sort()).toEqual(['b', 'c']);
    expect(result.state.activeSprintId).toBeNull();
    expect(result.state.draftSprintId).toBe(result.state.sprints[1].id);
    expect(result.taskFlagUpdates.a).toBe(false);
    expect(result.taskFlagUpdates.b).toBe(true);
    expect(result.taskFlagUpdates.c).toBe(true);
    expect(result.notifications[0]).toContain('auto-closed');
  });

  it('is a no-op when the deadline has not passed', () => {
    const entity = sprint({
      autoClose: {
        enabled: true,
        graceHours: 24,
        dueAt: Date.parse('2026-12-01T00:00:00Z'),
        policy: 'preselected',
        createNextDraft: true,
        notify: true,
        armedBy: 'test',
        armedAt: '',
        status: 'armed',
      },
    });
    const result = sweepSprintState(
      { activeSprintId: entity.id, draftSprintId: null, sprints: [entity] },
      [],
      Date.parse('2026-11-01T00:00:00Z'),
    );
    expect(result.changed).toBe(false);
  });

  it('skips an armed sprint whose persisted dueAt is not a finite number', () => {
    const entity = sprint({
      autoClose: {
        enabled: true,
        graceHours: 24,
        dueAt: Number.NaN,
        policy: 'carry-all',
        createNextDraft: true,
        notify: true,
        armedBy: 'test',
        armedAt: '',
        status: 'armed',
      },
    });
    const result = sweepSprintState(
      { activeSprintId: entity.id, draftSprintId: null, sprints: [entity] },
      [],
      Date.parse('2026-11-10T00:00:00Z'),
    );
    expect(result.changed).toBe(true);
    expect(result.closedSprintIds).toEqual([]);
    expect(result.state.sprints[0].status).toBe('active');
    expect(result.state.sprints[0].autoClose?.status).toBe('skipped');
  });

  it('skips an armed sprint that is far past its deadline instead of closing it', () => {
    const entity = sprint({
      autoClose: {
        enabled: true,
        graceHours: 24,
        dueAt: Date.parse('2026-10-31T00:00:00Z'),
        policy: 'carry-all',
        createNextDraft: true,
        notify: true,
        armedBy: 'test',
        armedAt: '',
        status: 'armed',
      },
    });
    const result = sweepSprintState(
      { activeSprintId: entity.id, draftSprintId: null, sprints: [entity] },
      [],
      Date.parse('2026-11-10T00:00:00Z'),
    );
    expect(result.changed).toBe(true);
    expect(result.closedSprintIds).toEqual([]);
    expect(result.state.sprints[0].status).toBe('active');
    expect(result.state.sprints[0].autoClose?.status).toBe('skipped');
  });
});

describe('sprint checklist migration', () => {
  it('maps an unambiguous legacy key to the renamed item', () => {
    const currentIds = SPRINT_CHECKLIST.map((item) => item.id);
    const checklist: Record<string, boolean> = Object.fromEntries(
      currentIds
        .filter((id) => id !== 'curation.externalIssues')
        .map((id) => [id, true]),
    );
    checklist['curation.legacy'] = true;

    const migrated = reconcileChecklist(checklist);

    expect(migrated['curation.externalIssues']).toBe(true);
    expect(migrated['curation.legacy']).toBeUndefined();
    for (const id of currentIds.filter((id) => id !== 'curation.externalIssues')) {
      expect(migrated[id]).toBe(true);
    }
  });

  it('does not guess when legacy and missing counts differ', () => {
    const migrated = reconcileChecklist({ 'curation.legacy': true });

    expect(migrated['curation.externalIssues']).toBeUndefined();
    expect(migrated['curation.legacy']).toBe(true);
  });
});
