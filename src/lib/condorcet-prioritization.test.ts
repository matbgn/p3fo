import { describe, expect, it } from 'vitest';
import type { PLTask } from './pl-prioritization';
import {
  condorcetProgress,
  expectedCondorcetComparisons,
  initCondorcetState,
  rankCondorcetResults,
  recordCondorcetComparison,
  selectNextCondorcetPair,
} from './condorcet-prioritization';

function makeTasks(n: number): PLTask[] {
  return Array.from({ length: n }, (_, index) => ({
    id: `t${index}`,
    title: `Task ${index}`,
  }));
}

describe('pure Condorcet prioritization', () => {
  it('computes the all-pairs comparison count', () => {
    expect(expectedCondorcetComparisons(0)).toBe(0);
    expect(expectedCondorcetComparisons(1)).toBe(0);
    expect(expectedCondorcetComparisons(2)).toBe(1);
    expect(expectedCondorcetComparisons(20)).toBe(190);
  });

  it('initializes every unordered pair exactly once', () => {
    const state = initCondorcetState(makeTasks(6), () => 0.5);
    expect(state.totalPairs).toBe(15);
    const keys = state.pairs.map((pair) => [pair.a, pair.b].sort().join('|'));
    expect(new Set(keys).size).toBe(15);
  });

  it('recovers a transitive user order exactly after all pairs', () => {
    const truth = ['t0', 't1', 't2', 't3', 't4'];
    let state = initCondorcetState(makeTasks(5), () => 0.5);

    while (!state.done) {
      expect(selectNextCondorcetPair(state)).not.toBeNull();
      const pair = state.pairs[state.comparedPairs];
      const winner =
        truth.indexOf(pair.a) < truth.indexOf(pair.b) ? pair.a : pair.b;
      state = recordCondorcetComparison(state, winner);
    }

    expect(state.comparedPairs).toBe(10);
    expect(rankCondorcetResults(state).map((result) => result.taskId)).toEqual(truth);
    expect(condorcetProgress(state)).toBe(100);
  });

  it('tracks partial progress and ignores a winner outside the current pair', () => {
    let state = initCondorcetState(makeTasks(4), () => 0.5);
    const pair = state.pairs[0];

    state = recordCondorcetComparison(state, 'unknown');
    expect(state.comparedPairs).toBe(0);

    state = recordCondorcetComparison(state, pair.a);
    expect(state.comparedPairs).toBe(1);
    expect(state.done).toBe(false);
    expect(condorcetProgress(state)).toBeCloseTo(100 / 6);
  });

  it('finalizes immediately for fewer than two tasks', () => {
    const state = initCondorcetState(makeTasks(1), () => 0.5);
    expect(state.done).toBe(true);
    expect(state.totalPairs).toBe(0);
    expect(selectNextCondorcetPair(state)).toBeNull();
    expect(condorcetProgress(state)).toBe(100);
  });
});
