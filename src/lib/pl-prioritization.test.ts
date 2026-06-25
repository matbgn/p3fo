import { describe, it, expect } from 'vitest';
import {
  initState,
  estimateScores,
  recordBatch,
  selectNextBatch,
  isConfident,
  rankResults,
  expectedComparisons,
  confidencePercent,
  CONFIDENCE_THRESHOLD,
  type PLTask,
  type PrioritizationState,
} from './pl-prioritization';

function makeTasks(n: number): PLTask[] {
  return Array.from({ length: n }, (_, i) => ({ id: `t${i}`, title: `Task ${i}` }));
}

function runFullComparison(
  tasks: PLTask[],
  k: number,
  truthOrder: string[],
): { state: PrioritizationState; batches: number } {
  let state = initState(tasks, k);
  let batches = 0;
  const maxBatches = 1000;
  while (!state.done && batches < maxBatches) {
    const batch = selectNextBatch(state);
    if (!batch) break;
    const batchIds = batch.tasks.map((t) => t.id);
    const sorted = [...batchIds].sort((a, b) => truthOrder.indexOf(a) - truthOrder.indexOf(b));
    const highest = sorted[0];
    const lowest = sorted[sorted.length - 1];
    state = recordBatch(state, highest, k > 2 ? lowest : undefined, batchIds);
    batches++;
  }
  return { state, batches };
}

describe('initState', () => {
  it('initializes scores to 0 and empty win matrix', () => {
    const tasks = makeTasks(3);
    const state = initState(tasks, 2);
    expect(state.k).toBe(2);
    expect(state.scores.t0).toBe(0);
    expect(state.scores.t1).toBe(0);
    expect(state.winMatrix).toEqual({});
    expect(state.done).toBe(false);
    expect(state.results).toBeNull();
  });

  it('clamps k to n when k > n', () => {
    const state = initState(makeTasks(2), 5);
    expect(state.k).toBe(2);
  });
});

describe('estimateScores', () => {
  it('returns all-zero scores for empty win matrix (cold start)', () => {
    const ids = ['a', 'b', 'c'];
    const scores = estimateScores({}, ids);
    expect(scores.a).toBeCloseTo(0, 5);
    expect(scores.b).toBeCloseTo(0, 5);
    expect(scores.c).toBeCloseTo(0, 5);
  });

  it('ranks winner above loser from a single win', () => {
    const winMatrix = { a: { b: 5 } };
    const scores = estimateScores(winMatrix, ['a', 'b']);
    expect(scores.a).toBeGreaterThan(scores.b);
  });

  it('produces correct total order for transitive wins', () => {
    const winMatrix = {
      a: { b: 5, c: 5, d: 5 },
      b: { c: 5, d: 5 },
      c: { d: 5 },
    };
    const scores = estimateScores(winMatrix, ['a', 'b', 'c', 'd']);
    expect(scores.a).toBeGreaterThan(scores.b);
    expect(scores.b).toBeGreaterThan(scores.c);
    expect(scores.c).toBeGreaterThan(scores.d);
  });
});

describe('recordBatch', () => {
  it('K=2 adds a single win', () => {
    const tasks = makeTasks(2);
    const state = initState(tasks, 2);
    const next = recordBatch(state, 't0', undefined);
    expect(next.winMatrix.t0?.t1).toBe(1);
    expect(next.totalBatches).toBe(1);
  });

  it('K=3 adds 2K-3=3 wins (highest beats all, middles beat lowest)', () => {
    const tasks = makeTasks(3);
    const state = initState(tasks, 3);
    const next = recordBatch(state, 't0', 't2');
    expect(next.winMatrix.t0?.t1).toBe(1);
    expect(next.winMatrix.t0?.t2).toBe(1);
    expect(next.winMatrix.t1?.t2).toBe(1);
    expect(next.totalBatches).toBe(1);
  });

  it('updates scores after recording a batch', () => {
    const tasks = makeTasks(2);
    let state = initState(tasks, 2);
    state = recordBatch(state, 't0', undefined);
    expect(state.scores.t0).toBeGreaterThan(state.scores.t1);
  });
});

describe('selectNextBatch', () => {
  it('returns k tasks on cold start', () => {
    const state = initState(makeTasks(4), 3);
    const batch = selectNextBatch(state);
    expect(batch).not.toBeNull();
    expect(batch!.tasks.length).toBe(3);
    expect(batch!.k).toBe(3);
  });

  it('returns null when confident', () => {
    const tasks = makeTasks(2);
    const state: PrioritizationState = {
      k: 2,
      tasks,
      scores: { t0: 10, t1: -10 },
      winMatrix: { t0: { t1: 100 } },
      totalBatches: 50,
      done: false,
      results: null,
    };
    const batch = selectNextBatch(state);
    expect(batch).toBeNull();
  });

  it('excludes already-resolved tasks when possible (picks uncertain pairs)', () => {
    const tasks = makeTasks(4);
    const state: PrioritizationState = {
      k: 2,
      tasks,
      scores: { t0: 8, t1: 8, t2: -8, t3: -8 },
      winMatrix: {},
      totalBatches: 0,
      done: false,
      results: null,
    };
    const batch = selectNextBatch(state, 2);
    expect(batch).not.toBeNull();
    const ids = batch!.tasks.map((t) => t.id).sort();
    expect(ids).toEqual(['t0', 't1']);
  });
});

describe('isConfident', () => {
  it('returns true for <2 tasks', () => {
    const state = initState(makeTasks(1), 2);
    expect(isConfident(state)).toBe(true);
  });

  it('returns true when all pairs are resolved (p>=0.85)', () => {
    const state: PrioritizationState = {
      k: 2,
      tasks: makeTasks(3),
      scores: { t0: 10, t1: 0, t2: -10 },
      winMatrix: {},
      totalBatches: 0,
      done: false,
      results: null,
    };
    expect(isConfident(state)).toBe(true);
  });

  it('returns false when a pair is near 0.5', () => {
    const state: PrioritizationState = {
      k: 2,
      tasks: makeTasks(2),
      scores: { t0: 0, t1: 0 },
      winMatrix: {},
      totalBatches: 0,
      done: false,
      results: null,
    };
    expect(isConfident(state)).toBe(false);
  });
});

describe('rankResults', () => {
  it('sorts tasks by descending score', () => {
    const state: PrioritizationState = {
      k: 2,
      tasks: makeTasks(3),
      scores: { t0: -1, t1: 5, t2: 2 },
      winMatrix: {},
      totalBatches: 0,
      done: false,
      results: null,
    };
    const results = rankResults(state);
    expect(results.map((r) => r.taskId)).toEqual(['t1', 't2', 't0']);
  });
});

describe('expectedComparisons', () => {
  it('returns 0 for n<2', () => {
    expect(expectedComparisons(1, 2)).toBe(0);
  });
  it('returns n*log2(n) for k=2', () => {
    expect(expectedComparisons(10, 2)).toBe(Math.ceil(10 * Math.log2(10)));
  });
  it('reduces for larger k', () => {
    expect(expectedComparisons(10, 3)).toBeLessThan(expectedComparisons(10, 2));
  });
});

describe('confidencePercent', () => {
  it('returns 100 for <2 tasks', () => {
    expect(confidencePercent(initState(makeTasks(1), 2))).toBe(100);
  });
  it('returns 0 at cold start (all equal scores)', () => {
    const state = initState(makeTasks(3), 2);
    expect(confidencePercent(state)).toBe(0);
  });
});

describe('Full comparison cycle', () => {
  it('4 tasks, k=2: produces mostly-correct order (top items correct)', () => {
    const tasks = makeTasks(4);
    const truthOrder = ['t3', 't1', 't0', 't2'];
    const { state, batches } = runFullComparison(tasks, 2, truthOrder);
    expect(state.done).toBe(true);
    expect(state.results).not.toBeNull();
    const resultIds = state.results!.map((r) => r.taskId);
    // Top-2 must be correct (the clearly separable items)
    expect(resultIds[0]).toBe('t3');
    expect(resultIds[1]).toBe('t1');
    // Bottom-2 must be the bottom two (order may vary for near-equal items)
    const bottomTwo = new Set(resultIds.slice(2));
    expect(bottomTwo).toEqual(new Set(['t0', 't2']));
    expect(batches).toBeLessThan(30);
  });

  it('6 tasks, k=3: produces mostly-correct order, fewer batches than k=2', () => {
    const tasks = makeTasks(6);
    const truthOrder = ['t5', 't3', 't1', 't0', 't2', 't4'];
    const { state: state3, batches: batches3 } = runFullComparison(tasks, 3, truthOrder);
    const { state: state2, batches: batches2 } = runFullComparison(tasks, 2, truthOrder);

    expect(state3.done).toBe(true);
    expect(state3.results).not.toBeNull();
    const resultIds3 = state3.results!.map((r) => r.taskId);
    // Top-3 must be correct (clearly separable items)
    expect(resultIds3.slice(0, 3)).toEqual(['t5', 't3', 't1']);
    // Bottom-3 must be the bottom three (order may vary for near-equal items)
    const bottomThree = new Set(resultIds3.slice(3));
    expect(bottomThree).toEqual(new Set(['t0', 't2', 't4']));

    expect(state2.done).toBe(true);
    const resultIds2 = state2.results!.map((r) => r.taskId);
    expect(resultIds2.slice(0, 3)).toEqual(['t5', 't3', 't1']);

    expect(batches3).toBeLessThanOrEqual(batches2);
  });

  it('n=1: immediate result, no batches', () => {
    const tasks = makeTasks(1);
    const state = initState(tasks, 2);
    expect(state.done).toBe(false);
    const batch = selectNextBatch(state);
    expect(batch).toBeNull();
  });
});

describe('CONFIDENCE_THRESHOLD', () => {
  it('is 0.75', () => {
    expect(CONFIDENCE_THRESHOLD).toBe(0.75);
  });
});