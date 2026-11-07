import { describe, expect, it } from 'vitest';
import {
  insertTaskAt,
  isActionableStatus,
  resolveStoryboardInsertion,
} from './storyboard-drop';
import type { Task, TriageStatus } from '@/hooks/useTasks';

function makeTask(id: string, triageStatus: TriageStatus): Task {
  return {
    id,
    title: id,
    createdAt: 0,
    triageStatus,
    timer: [],
  };
}

describe('storyboard drop placement', () => {
  const ready = makeTask('ready', 'Ready');
  const wip = makeTask('wip', 'WIP');
  const backlog1 = makeTask('backlog-1', 'Backlog');
  const backlog2 = makeTask('backlog-2', 'Backlog');

  it('treats Ready and WIP as actionable', () => {
    expect(isActionableStatus('Ready')).toBe(true);
    expect(isActionableStatus('WIP')).toBe(true);
    expect(isActionableStatus('Backlog')).toBe(false);
    expect(isActionableStatus('Blocked')).toBe(false);
    expect(isActionableStatus('Done')).toBe(false);
  });

  it('keeps an actionable card inside the actionable block', () => {
    const base = [ready, wip, backlog1];
    const resolution = resolveStoryboardInsertion(3, base, makeTask('moved', 'Ready'));

    expect(resolution).toEqual({ index: 2, lockedGroup: 'non-actionable' });
  });

  it('clamps a backlog card above ready work to the first backlog slot', () => {
    const base = [ready, wip, backlog2];
    const resolution = resolveStoryboardInsertion(0, base, backlog1);

    expect(resolution).toEqual({ index: 2, lockedGroup: 'actionable' });
  });

  it('allows backlog cards to reorder within the backlog block', () => {
    const base = [ready, wip, backlog2];
    const resolution = resolveStoryboardInsertion(3, base, backlog1);

    expect(resolution).toEqual({ index: 3, lockedGroup: null });
  });

  it('allows actionable cards to reorder within the actionable block', () => {
    const base = [ready, wip, backlog1];
    const resolution = resolveStoryboardInsertion(1, base, makeTask('moved', 'WIP'));

    expect(resolution).toEqual({ index: 1, lockedGroup: null });
  });

  it('inserts at the resolved index without mutating the input', () => {
    const base = [ready, backlog1];
    const moved = makeTask('moved', 'Backlog');

    const order = insertTaskAt(base, moved, 2);

    expect(order.map(task => task.id)).toEqual(['ready', 'backlog-1', 'moved']);
    expect(base.map(task => task.id)).toEqual(['ready', 'backlog-1']);
  });

  it('clamps an out-of-range insertion index', () => {
    expect(insertTaskAt([ready], backlog1, 99).map(task => task.id)).toEqual(['ready', 'backlog-1']);
    expect(insertTaskAt([ready], backlog1, -1).map(task => task.id)).toEqual(['backlog-1', 'ready']);
  });
});
